import { KINSHIP, getMembers } from '../ontology/queries.js';

const PUNCT = /[，。,；;！!？?\n]/;
const HEALTH_HINT = /(病|炎|症|痛|疼|偏高|偏低|不好|不足|失眠|虚|弱|肥胖|超重|偏瘦|咳|喘|胃|肠|肝|肾|心脏|血|过敏|感冒|发烧|便秘|腹泻|湿疹|哮喘|近视)/;
const REQUEST_HINT = /(推荐|吃什么|能吃|可以吃|适合|怎么|如何|吗|呢|多少|哪|帮|请|做|买|查|看看)/;
const NEGATION = /(没有|没|无|不是|已经好了|好了|治好)$/;
const ALLERGEN_SPLIT = /[和、及与跟,，\s]+/;

const blank = (s, start, len) => s.slice(0, start) + ' '.repeat(len) + s.slice(start + len);

function findMentions(text, names) {
  const sorted = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  const mentions = [];
  let masked = text;
  for (const name of sorted) {
    let idx = masked.indexOf(name);
    while (idx >= 0) {
      mentions.push({ name, index: idx });
      masked = blank(masked, idx, name.length);
      idx = masked.indexOf(name, idx + name.length);
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
}

function extractFacts(segment, graph) {
  let work = segment;
  const facts = { conditions: [], removedConditions: [], allergies: [], attributes: [], age: undefined };

  // 1) Known health conditions (ontology vocabulary, longest synonyms first)
  const vocab = graph.findEntities('HealthCondition')
    .flatMap(c => [c.label, ...(c.synonyms || [])].map(term => ({ term, c })))
    .filter(v => v.term && v.term.length > 1)
    .sort((a, b) => b.term.length - a.term.length);
  for (const { term, c } of vocab) {
    let idx = work.indexOf(term);
    while (idx >= 0) {
      const before = work.slice(Math.max(0, idx - 4), idx);
      const target = NEGATION.test(before.trim()) ? facts.removedConditions : facts.conditions;
      if (!target.includes(c.label)) target.push(c.label);
      work = blank(work, idx, term.length);
      idx = work.indexOf(term);
    }
  }

  // 2) Allergies: "对花生过敏" / "花生过敏"
  const allergyPatterns = [/对([^，。,；;！!？?\s]{1,12}?)过敏/g, /([^，。,；;！!？?\s对有]{1,8}?)过敏(?!性)/g];
  for (const re of allergyPatterns) {
    work = work.replace(re, (m, raw) => {
      raw.split(ALLERGEN_SPLIT).map(s => s.replace(/^(最近|平时|经常|容易|一吃|吃了|吃|有点|有些|还|也|会)+/, '').trim()).filter(Boolean)
        .forEach(a => { if (!facts.allergies.includes(a)) facts.allergies.push(a); });
      return ' '.repeat(m.length);
    });
  }

  // 3) Age / height / weight
  work = work.replace(/(\d{1,3})\s*(?:周岁|岁)/, (m, n) => { facts.age = Number(n); return ' '.repeat(m.length); });
  work = work.replace(/身高\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(cm|厘米|公分|米|m)?/i, (m, n, u) => {
    facts.attributes.push({ key: '身高', value: `${n}${u || 'cm'}` });
    return ' '.repeat(m.length);
  });
  work = work.replace(/体重\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(kg|公斤|千克|斤)?/i, (m, n, u) => {
    facts.attributes.push({ key: '体重', value: `${n}${u || 'kg'}` });
    return ' '.repeat(m.length);
  });

  // 4) Diet preferences
  work = work.replace(/(不爱吃|不喜欢吃|不能吃|不吃|忌口)\s*[:：]?\s*([^，。,；;！!？?\s]{1,12})/g, (m, verb, what) => {
    facts.attributes.push({ key: '饮食禁忌', value: `${verb === '忌口' ? '忌' : '不吃'}${what}` });
    return ' '.repeat(m.length);
  });
  work = work.replace(/(爱吃|喜欢吃|喜欢喝|爱喝)\s*([^，。,；;！!？?\s]{1,12})/g, (m, verb, what) => {
    facts.attributes.push({ key: '饮食偏好', value: `${verb}${what}` });
    return ' '.repeat(m.length);
  });

  // 5) Open-ended "属性：值" pairs (no restriction on attribute names)
  work = work.replace(/([^\s，。,；;：:]{1,8})\s*[:：]\s*([^，。,；;！!？?]{1,30})/g, (m, key, value) => {
    facts.attributes.push({ key: key.trim(), value: value.trim() });
    return ' '.repeat(m.length);
  });

  // 6) Remaining clauses that still look health related become free-form notes
  work.split(PUNCT).map(s => s.replace(/^\s*(的|有|是|还有|还|也|并且|而且|最近|平时|经常)?\s*/, '').trim())
    .filter(s => s.length >= 2 && HEALTH_HINT.test(s) && !REQUEST_HINT.test(s))
    .forEach(s => facts.attributes.push({ key: '健康备注', value: s }));

  return facts;
}

const hasFacts = (f) => f.conditions.length || f.removedConditions.length || f.allergies.length
  || f.attributes.length || f.age !== undefined;

/**
 * Local (no-LLM) natural language understanding for family health profiles.
 * Splits the text into per-member segments and extracts open-ended facts.
 * Returns the same structure the LLM is asked to produce for the
 * update_member_profile capability.
 */
export function extractProfileUpdates(text, graph) {
  const source = String(text || '');
  const explicitNew = [...source.matchAll(/(?:新增|添加|增加)(?:家庭)?(?:成员|家人)\s*[:：]?\s*([^\s，。,；;：:]{1,6})/g)].map(m => m[1]);
  const names = [...getMembers(graph).map(m => m.name), ...Object.keys(KINSHIP), ...explicitNew];
  const mentions = findMentions(source, names);
  const updates = [];

  mentions.forEach((mention, i) => {
    const end = i + 1 < mentions.length ? mentions[i + 1].index : source.length;
    const segment = source.slice(mention.index + mention.name.length, end);
    const facts = extractFacts(segment, graph);
    const existing = updates.find(u => u.member === mention.name);
    if (!hasFacts(facts) && !explicitNew.includes(mention.name)) return;
    if (existing) {
      existing.conditions.push(...facts.conditions);
      existing.removedConditions.push(...facts.removedConditions);
      existing.allergies.push(...facts.allergies);
      existing.attributes.push(...facts.attributes);
      if (facts.age !== undefined) existing.age = facts.age;
    } else {
      updates.push({ member: mention.name, ...facts });
    }
  });

  return updates;
}
