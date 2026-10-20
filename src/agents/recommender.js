import { getFamilyProfiles, getIngredients, getIngredientFacts } from '../ontology/queries.js';
import { FOOD_SOURCES, seasonOfMonth } from '../ontology/schema.js';
import { dietaryTypeFromAttributes } from '../ontology/diet.js';

export const currentMonth = () => new Date().getMonth() + 1;

const sourceIds = new Set(FOOD_SOURCES.map(s => s.id));
const vegetarianSources = new Set(['food_plant', 'food_fungus', 'food_egg', 'food_dairy', 'food_animal_other']);
const veganSources = new Set(['food_plant', 'food_fungus']);
const avoidedSources = new Map([
  ...['不吃肉', '不吃肉类', '不能吃肉', '忌肉'].map(v => [v, ['food_meat']]),
  ...['不吃荤', '不吃荤食', '忌荤'].map(v => [v, ['food_meat', 'food_fish', 'food_seafood']]),
]);

function dietExclusions(profiles, sources) {
  return profiles.flatMap(p => {
    const diet = dietaryTypeFromAttributes(p.attributes);
    const avoided = new Set(p.attributes.filter(a => ['饮食禁忌', '饮食偏好'].includes(a.key))
      .flatMap(a => avoidedSources.get(typeof a.value === 'string' ? a.value.trim() : '') || []));
    const restricted = ['vegetarian', 'vegan'].includes(diet);
    if (!restricted && !avoided.size) return [];
    const label = restricted ? `采用${diet === 'vegan' ? '纯素' : '素食'}饮食` : '有饮食禁忌';
    if (!Array.isArray(sources) || !sources.length || sources.some(s => !sourceIds.has(s))) {
      return [`${p.member.name}${label}，来源信息不完整，暂不推荐`];
    }
    const allowed = diet === 'vegan' ? veganSources : diet === 'vegetarian' ? vegetarianSources : sourceIds;
    const forbidden = sources.filter(s => !allowed.has(s) || avoided.has(s));
    return forbidden.length
      ? [`${p.member.name}${label}，排除${forbidden.map(s => FOOD_SOURCES.find(f => f.id === s).label).join('、')}`]
      : [];
  });
}

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
    const dietReasons = dietExclusions(profiles, graph.objects(ingredient.id, 'derivedFrom'));
    if (dietReasons.length) {
      excluded.push({ ingredient, reason: dietReasons.join('；') });
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

/** Recommends simple recipes composed of well-scored, allergy- and diet-safe ingredients. */
export function recommendRecipes(graph, { month = currentMonth(), mealType, memberIds, limit = 4 } = {}) {
  const { items, excluded, profiles } = recommendIngredients(graph, { month, memberIds });
  const byId = new Map(items.map(i => [i.ingredient.id, i]));
  const excludedIds = new Set(excluded.map(e => e.ingredient.id));
  const excludedRecipes = [];

  const recipes = graph.findEntities('Recipe')
    .filter(r => !mealType || (r.mealType || '').includes(mealType))
    .map(recipe => {
      const ingredientIds = graph.objects(recipe.id, 'usesIngredient');
      const reasons = excluded.filter(e => ingredientIds.includes(e.ingredient.id))
        .map(e => `${e.ingredient.label}：${e.reason}`);
      if (ingredientIds.some(id => excludedIds.has(id))) {
        excludedRecipes.push({ recipe, reason: reasons.join('；') });
        return null;
      }
      // Unlinked ingredients and unclassified extras cannot be certified for a restricted diet.
      const unknown = !ingredientIds.length || ingredientIds.some(id => !byId.has(id));
      const extraReasons = dietExclusions(profiles, unknown ? undefined
        : recipe.extras?.length ? graph.objects(recipe.id, 'extrasDerivedFrom') : ['food_plant']);
      if (extraReasons.length) {
        excludedRecipes.push({ recipe, reason: extraReasons.join('；') });
        return null;
      }
      const scored = ingredientIds.map(id => byId.get(id)).filter(Boolean);
      const score = scored.reduce((s, i) => s + i.score, 0) / Math.max(scored.length, 1)
        + (scored.every(i => i.inSeason) ? 1 : 0);
      const warnings = scored.flatMap(i => i.warnings.map(w => ({ ...w, ingredient: i.ingredient })));
      return { recipe, ingredients: scored, score, warnings };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return { recipes: recipes.slice(0, limit), total: recipes.length, excluded: excludedRecipes };
}
