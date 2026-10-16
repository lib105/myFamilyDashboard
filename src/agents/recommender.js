import { getFamilyProfiles, getIngredients, getIngredientFacts } from '../ontology/queries.js';
import { seasonOfMonth } from '../ontology/schema.js';

export const currentMonth = () => new Date().getMonth() + 1;

/**
 * Scores every ingredient for the given family members by walking the
 * ontology: Member -hasCondition-> Condition <-benefits/cautionFor- Ingredient,
 * Member -allergicTo-> Allergen <-containsAllergen- Ingredient, and the
 * ingredient's seasonal months. In-season ingredients are preferred.
 */
export function recommendIngredients(graph, { month = currentMonth(), category = 'all', memberIds } = {}) {
  const profiles = getFamilyProfiles(graph).filter(p => !memberIds?.length || memberIds.includes(p.member.id));
  const hasConditions = profiles.some(p => p.conditions.length > 0);
  const items = [];
  const excluded = [];

  for (const ingredient of getIngredients(graph)) {
    if (category && category !== 'all' && ingredient.category !== category) continue;
    const facts = getIngredientFacts(graph, ingredient);
    const inSeason = (ingredient.months || []).includes(month);
    const benefitIds = new Set(facts.benefits.map(c => c.id));
    const cautionIds = new Set(facts.cautions.map(c => c.id));
    const allergenIds = new Set(facts.allergens.map(a => a.id));

    const allergicMembers = profiles.filter(p => p.allergens.some(a => allergenIds.has(a.id)));
    if (allergicMembers.length) {
      excluded.push({
        ingredient,
        reason: allergicMembers.map(p => `${p.member.name}对${p.allergens.filter(a => allergenIds.has(a.id)).map(a => a.label).join('、')}过敏`).join('；'),
      });
      continue;
    }

    let score = inSeason ? 3 : 0;
    const reasons = [];
    const warnings = [];
    for (const p of profiles) {
      for (const c of p.conditions) {
        if (benefitIds.has(c.id)) {
          score += 2;
          reasons.push({ member: p.member, condition: c });
        }
        if (cautionIds.has(c.id)) {
          score -= 3;
          warnings.push({ member: p.member, condition: c });
        }
      }
    }
    if (!hasConditions) score += benefitIds.size * 0.2;
    items.push({ ingredient, facts, inSeason, score, reasons, warnings });
  }

  items.sort((a, b) => b.score - a.score || Number(b.inSeason) - Number(a.inSeason));
  return { month, season: seasonOfMonth(month), items, excluded, profiles };
}

/** Recommends simple recipes composed of well-scored, allergy-safe ingredients. */
export function recommendRecipes(graph, { month = currentMonth(), mealType, memberIds, limit = 4 } = {}) {
  const { items, excluded } = recommendIngredients(graph, { month, memberIds });
  const byId = new Map(items.map(i => [i.ingredient.id, i]));
  const excludedIds = new Set(excluded.map(e => e.ingredient.id));

  const recipes = graph.findEntities('Recipe')
    .filter(r => !mealType || (r.mealType || '').includes(mealType))
    .map(recipe => {
      const ingredientIds = graph.objects(recipe.id, 'usesIngredient');
      if (ingredientIds.some(id => excludedIds.has(id))) return null;
      const scored = ingredientIds.map(id => byId.get(id)).filter(Boolean);
      const score = scored.reduce((s, i) => s + i.score, 0) / Math.max(scored.length, 1)
        + (scored.every(i => i.inSeason) ? 1 : 0);
      const warnings = scored.flatMap(i => i.warnings.map(w => ({ ...w, ingredient: i.ingredient })));
      return { recipe, ingredients: scored, score, warnings };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return { recipes: recipes.slice(0, limit), total: recipes.length };
}
