import { CLASSES, SEASONS, FOOD_SOURCES } from './schema.js';
import conditions from '../data/food/conditions.json';
import allergens from '../data/food/allergens.json';
import ingredients from '../data/food/ingredients.json';
import ingredientSources from '../data/food/ingredientSources.json';
import recipes from '../data/food/recipes.json';
import recipeExtraSources from '../data/food/recipeExtraSources.json';
import recipeExtraAllergens from '../data/food/recipeExtraAllergens.json';
import priceData from '../data/food/supermarketPrices.json';
import promotions from '../data/food/appDiscounts.json';
import shipments from '../data/food/logistics.json';
import agentData from '../data/food/agents.json';
import members from '../data/members.json';
import trips from '../data/trips.json';
import tasks from '../data/tasks.json';
import reminders from '../data/healthReminders.json';
import pantry from '../data/food/pantry.json';
import browserSites from '../data/browserSites.json';
import { findMember, setMemberAttribute } from './queries.js';
import { dietaryTypeFromAttributes } from './diet.js';

export const condId = (id) => `cond_${id}`;
export const allergenId = (id) => `allergen_${id}`;
export const ingId = (id) => `ing_${id}`;
export const memberId = (id) => (id ? `member_${id}` : '');
export const classEntityId = (cls) => `class_${cls}`;

/** Loads static local knowledge into the "base" layer of the graph. */
export function seedBase(graph) {
  graph.batch(() => {
    Object.entries(CLASSES).forEach(([k, v]) => {
      graph.addEntity({ id: classEntityId(k), type: 'OntologyClass', className: k, label: v.label, description: v.description }, 'base');
    });
    SEASONS.forEach(s => graph.addEntity({ ...s, type: 'Season' }, 'base'));
    FOOD_SOURCES.forEach(s => graph.addEntity({ ...s, type: 'FoodSource' }, 'base'));

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
    Object.entries(ingredientSources).forEach(([source, ids]) => {
      ids.forEach(id => graph.addTriple(ingId(id), 'derivedFrom', source, 'base'));
    });

    recipes.forEach(r => {
      const { ingredients: used, ...props } = r;
      graph.addEntity({ ...props, type: 'Recipe' }, 'base');
      used.forEach(i => graph.addTriple(r.id, 'usesIngredient', ingId(i), 'base'));
    });
    Object.entries(recipeExtraSources).forEach(([source, ids]) => {
      ids.forEach(id => graph.addTriple(id, 'extrasDerivedFrom', source, 'base'));
    });
    Object.entries(recipeExtraAllergens).forEach(([allergen, ids]) => {
      ids.forEach(id => graph.addTriple(id, 'extrasContainAllergen', allergenId(allergen), 'base'));
    });

    priceData.stores.forEach(s => graph.addEntity({ ...s, type: 'Store' }, 'base'));
    Object.entries(priceData.prices).forEach(([ing, row]) => {
      priceData.stores.forEach(store => {
        if (row[store.id] === undefined) return;
        const id = `offer_${ing}_${store.id}`;
        graph.addEntity({
          id,
          type: 'PriceOffer',
          price: row[store.id],
          unit: row.unit,
          updatedAt: row.updatedAt || null,
          source: '历史未核验报价（不可作为实时价格）',
          verified: false,
        }, 'base');
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

    trips.forEach(t => {
      const { assignments = [], checklist = [], wishes = [], ...props } = t;
      graph.addEntity({
        ...props,
        id: `trip_${t.id}`,
        type: 'Trip',
        // Nested checklist items / assignments / wishes reference FamilyMember entity ids, never names.
        checklist: checklist.map(({ assignee, ...c }) => ({ ...c, memberId: memberId(assignee) })),
        assignments: assignments.map(a => ({ ...a, memberId: memberId(a.memberId) })),
        wishes: wishes.map(w => ({ ...w, memberId: memberId(w.memberId) })),
      }, 'base');
    });
    // Task -assignedTo-> / HealthReminder -reminderFor-> FamilyMember are linked by linkDemoActivities,
    // because family members live in the user layer.
    tasks.forEach(t => graph.addEntity({ ...t, assignedTo: undefined, id: `task_${t.id}`, type: 'Task' }, 'base'));
    reminders.forEach(r => graph.addEntity({ ...r, memberId: undefined, id: `reminder_${r.id}`, type: 'HealthReminder' }, 'base'));
    pantry.forEach(p => {
      const { ingredientId, ...props } = p;
      graph.addEntity({ ...props, type: 'PantryItem' }, 'base');
      graph.addTriple(p.id, 'stocksIngredient', ingId(ingredientId), 'base');
    });
    browserSites.forEach(s => {
      graph.addEntity({ ...s, type: 'BrowserSite' }, 'base');
    });

    agentData.agents.forEach(a => graph.addEntity({ ...a, type: 'Agent' }, 'base'));
    agentData.capabilities.forEach(c => {
      const { agentId, mutates = [], reads = [], browserSites: siteIds = [], ...props } = c;
      graph.addEntity({ ...props, type: 'Capability', kind: 'builtin', enabled: true }, 'base');
      graph.addTriple(c.id, 'providedBy', agentId, 'base');
      mutates.forEach(cls => {
        if (CLASSES[cls]) graph.addTriple(c.id, 'mutatesClass', classEntityId(cls), 'base');
      });
      reads.forEach(cls => {
        if (CLASSES[cls]) graph.addTriple(c.id, 'readsClass', classEntityId(cls), 'base');
      });
      siteIds.forEach(sid => {
        if (graph.getEntity(sid)?.type === 'BrowserSite') graph.addTriple(c.id, 'usesBrowserSite', sid, 'base');
      });
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
    linkDemoActivities(graph);
  });
}

/** Links the built-in tasks / health reminders to the example family members that still exist. */
export function linkDemoActivities(graph) {
  const link = (s, p, ref) => {
    const o = memberId(ref);
    if (graph.getEntity(s) && graph.getEntity(o)?.type === 'FamilyMember') graph.addTriple(s, p, o);
  };
  graph.batch(() => {
    tasks.forEach(t => (t.assignedTo || []).forEach(m => link(`task_${t.id}`, 'assignedTo', m)));
    reminders.forEach(r => link(`reminder_${r.id}`, 'reminderFor', r.memberId));
  });
}

/**
 * Upgrades knowledge persisted by older versions, where tasks / reminders
 * pointed at members through name strings and capabilities duplicated their
 * `providedBy` relation in an `agentId` property. Explicit legacy diet
 * declarations are consolidated into the single-valued 饮食类型 attribute.
 */
export function migrateLegacyKnowledge(graph) {
  graph.batch(() => {
    graph.findEntities('FamilyMember').forEach(member => {
      const attributes = graph.objects(member.id, 'hasAttribute');
      const type = dietaryTypeFromAttributes(attributes);
      if (type && (attributes.filter(a => a.key === '饮食类型').length !== 1
        || attributes.some(a => a.key !== '饮食类型' && dietaryTypeFromAttributes([a]))
        || !attributes.some(a => a.key === '饮食类型' && a.value === type))) {
        setMemberAttribute(graph, member.id, '饮食类型', type);
      }
    });
    linkDemoActivities(graph);
    graph.findEntities('Task', t => Array.isArray(t.assignees)).forEach(t => {
      t.assignees.forEach(name => {
        const m = findMember(graph, name);
        if (m) graph.addTriple(t.id, 'assignedTo', m.id);
      });
      graph.updateEntity(t.id, { assignees: undefined });
    });
    graph.findEntities('HealthReminder', r => typeof r.member === 'string').forEach(r => {
      const m = findMember(graph, r.member);
      if (m) graph.addTriple(r.id, 'reminderFor', m.id);
      graph.updateEntity(r.id, { member: undefined });
    });
    // Persisted checklist overrides may still carry assignee names.
    graph.findEntities('Trip', t => (t.checklist || []).some(c => 'assignee' in c)).forEach(t => {
      const shipped = trips.find(x => `trip_${x.id}` === t.id)?.checklist || [];
      graph.updateEntity(t.id, {
        checklist: t.checklist.map(({ assignee, ...c }) => ({
          ...c,
          memberId: c.memberId || memberId(shipped.find(x => x.id === c.id)?.assignee) || findMember(graph, assignee)?.id || '',
        })),
      });
    });
    graph.findEntities('Capability', c => c.agentId !== undefined)
      .forEach(c => graph.updateEntity(c.id, { agentId: undefined }));
  });
}
