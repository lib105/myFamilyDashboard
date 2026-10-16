import { SEASONS } from './schema.js';
import conditions from '../data/food/conditions.json';
import allergens from '../data/food/allergens.json';
import ingredients from '../data/food/ingredients.json';
import recipes from '../data/food/recipes.json';
import priceData from '../data/food/supermarketPrices.json';
import promotions from '../data/food/appDiscounts.json';
import shipments from '../data/food/logistics.json';
import agentData from '../data/food/agents.json';
import members from '../data/members.json';

export const condId = (id) => `cond_${id}`;
export const allergenId = (id) => `allergen_${id}`;
export const ingId = (id) => `ing_${id}`;

/** Loads static local knowledge into the "base" layer of the graph. */
export function seedBase(graph) {
  graph.batch(() => {
    SEASONS.forEach(s => graph.addEntity({ ...s, type: 'Season' }, 'base'));

    conditions.forEach(c => graph.addEntity({ ...c, id: condId(c.id), type: 'HealthCondition' }, 'base'));
    allergens.forEach(a => graph.addEntity({ ...a, id: allergenId(a.id), type: 'Allergen' }, 'base'));

    ingredients.forEach(i => {
      const { benefits, cautions, allergens: ingAllergens, ...props } = i;
      const id = ingId(i.id);
      graph.addEntity({ ...props, id, type: 'Ingredient' }, 'base');
      benefits.forEach(c => graph.addTriple(id, 'benefits', condId(c), 'base'));
      cautions.forEach(c => graph.addTriple(id, 'cautionFor', condId(c), 'base'));
      ingAllergens.forEach(a => graph.addTriple(id, 'containsAllergen', allergenId(a), 'base'));
      SEASONS.filter(s => s.months.some(m => i.months.includes(m)))
        .forEach(s => graph.addTriple(id, 'availableIn', s.id, 'base'));
    });

    recipes.forEach(r => {
      const { ingredients: used, ...props } = r;
      graph.addEntity({ ...props, type: 'Recipe' }, 'base');
      used.forEach(i => graph.addTriple(r.id, 'usesIngredient', ingId(i), 'base'));
    });

    priceData.stores.forEach(s => graph.addEntity({ ...s, type: 'Store' }, 'base'));
    Object.entries(priceData.prices).forEach(([ing, row]) => {
      priceData.stores.forEach(store => {
        if (row[store.id] === undefined) return;
        const id = `offer_${ing}_${store.id}`;
        graph.addEntity({ id, type: 'PriceOffer', price: row[store.id], unit: row.unit }, 'base');
        graph.addTriple(id, 'offerOf', ingId(ing), 'base');
        graph.addTriple(id, 'soldAt', store.id, 'base');
      });
    });

    promotions.forEach(p => {
      const { ingredientIds, ...props } = p;
      const id = `promo_${p.id}`;
      graph.addEntity({ ...props, id, type: 'Promotion' }, 'base');
      ingredientIds.forEach(i => graph.addTriple(id, 'promotes', ingId(i), 'base'));
    });

    shipments.forEach(s => graph.addEntity({ ...s, id: `ship_${s.trackingNo}`, type: 'Shipment' }, 'base'));

    agentData.agents.forEach(a => graph.addEntity({ ...a, type: 'Agent' }, 'base'));
    agentData.capabilities.forEach(c => {
      const { agentId, ...props } = c;
      graph.addEntity({ ...props, type: 'Capability', kind: 'builtin', enabled: true, agentId }, 'base');
      graph.addTriple(c.id, 'providedBy', agentId, 'base');
    });
  });
}

const DEMO_PROFILE = {
  m1: { conditions: ['hypertension'], attributes: [{ key: '饮食偏好', value: '爱吃面食' }] },
  m2: { conditions: ['allergic_rhinitis'], allergens: ['mango'] },
  m3: { conditions: ['low_immunity'], attributes: [{ key: '健康备注', value: '换季容易感冒' }] },
  m4: { conditions: ['child_growth'], allergens: ['peanut'] },
};

/** Seeds an example family in the "user" layer (first launch / reset). */
export function seedDemoFamily(graph) {
  graph.batch(() => {
    members.forEach(m => {
      const id = `member_${m.id}`;
      graph.addEntity({ id, type: 'FamilyMember', name: m.name, avatar: m.avatar, role: m.role, age: m.age }, 'user');
      const demo = DEMO_PROFILE[m.id] || {};
      (demo.conditions || []).forEach(c => graph.addTriple(id, 'hasCondition', condId(c)));
      (demo.allergens || []).forEach(a => graph.addTriple(id, 'allergicTo', allergenId(a)));
      (demo.attributes || []).forEach(a => graph.addTriple(id, 'hasAttribute', a));
    });
  });
}
