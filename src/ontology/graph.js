import { CLASSES, RELATIONS, LITERAL } from './schema.js';

const tripleKey = (s, p, o) => `${s}|${p}|${typeof o === 'string' ? o : JSON.stringify(o)}`;

/**
 * A tiny in-memory knowledge graph (ABox) validated against the ontology
 * schema. Entities/triples live in one of two layers:
 *  - "base": static knowledge seeded from local mock data (not persisted)
 *  - "user": knowledge created through conversation (persisted)
 * Patches applied to base entities (e.g. disabling a builtin capability) are
 * persisted as overrides.
 */
export class KnowledgeGraph {
  constructor({ storage, storageKey } = {}) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.entities = new Map();
    this.triples = new Map();
    this.overrides = {};
    this.version = 0;
    this.listeners = new Set();
    this.batchDepth = 0;
    this.dirty = false;
  }

  /* ---------- subscription ---------- */
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = () => this.version;

  changed() {
    if (this.batchDepth > 0) {
      this.dirty = true;
      return;
    }
    this.version += 1;
    this.persist();
    this.listeners.forEach(l => l());
  }

  batch(fn) {
    this.batchDepth += 1;
    try {
      return fn();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.dirty) {
        this.dirty = false;
        this.changed();
      }
    }
  }

  /* ---------- entities ---------- */
  addEntity(entity, layer = 'user') {
    if (!entity?.id) throw new Error('实体缺少 id');
    if (!CLASSES[entity.type]) throw new Error(`未知的本体类：${entity.type}`);
    const existing = this.entities.get(entity.id);
    const merged = { ...existing, ...entity, layer: existing?.layer || layer };
    if (merged.layer === 'base' && this.overrides[entity.id]) {
      Object.assign(merged, this.overrides[entity.id]);
    }
    this.entities.set(entity.id, merged);
    this.changed();
    return merged;
  }

  updateEntity(id, patch) {
    const e = this.entities.get(id);
    if (!e) throw new Error(`实体不存在：${id}`);
    const next = { ...e, ...patch, id: e.id, type: e.type, layer: e.layer };
    this.entities.set(id, next);
    if (e.layer === 'base') {
      this.overrides[id] = { ...this.overrides[id], ...patch };
    }
    this.changed();
    return next;
  }

  removeEntity(id) {
    const e = this.entities.get(id);
    if (!e) return;
    if (e.layer === 'base') throw new Error('内置知识不可删除，可改为禁用');
    this.entities.delete(id);
    for (const [k, t] of this.triples) {
      if (t.s === id || t.o === id) this.triples.delete(k);
    }
    this.changed();
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  findEntities(type, predicate = () => true) {
    const out = [];
    for (const e of this.entities.values()) {
      if (e.type === type && predicate(e)) out.push(e);
    }
    return out;
  }

  /* ---------- triples ---------- */
  addTriple(s, p, o, layer = 'user') {
    const rel = RELATIONS[p];
    if (!rel) throw new Error(`未知的本体关系：${p}`);
    const subject = this.entities.get(s);
    if (!subject) throw new Error(`主语实体不存在：${s}`);
    if (subject.type !== rel.domain) throw new Error(`关系 ${p} 的主语必须是 ${rel.domain}`);
    if (rel.range === LITERAL) {
      if (typeof o !== 'object' || o === null) throw new Error(`关系 ${p} 的宾语必须是字面量对象`);
    } else {
      const object = this.entities.get(o);
      if (!object) throw new Error(`宾语实体不存在：${o}`);
      if (object.type !== rel.range) throw new Error(`关系 ${p} 的宾语必须是 ${rel.range}`);
    }
    const key = tripleKey(s, p, o);
    if (!this.triples.has(key)) {
      this.triples.set(key, { s, p, o, layer });
      this.changed();
    }
  }

  removeTriple(s, p, o) {
    const key = tripleKey(s, p, o);
    const t = this.triples.get(key);
    if (!t) return;
    if (t.layer === 'base') throw new Error('内置知识不可删除');
    this.triples.delete(key);
    this.changed();
  }

  query({ s, p, o } = {}) {
    const out = [];
    for (const t of this.triples.values()) {
      if (s !== undefined && t.s !== s) continue;
      if (p !== undefined && t.p !== p) continue;
      if (o !== undefined && t.o !== o) continue;
      out.push(t);
    }
    return out;
  }

  objects(s, p) {
    return this.query({ s, p }).map(t => t.o);
  }

  subjects(p, o) {
    return this.query({ p, o }).map(t => t.s);
  }

  /* ---------- persistence (user layer + overrides) ---------- */
  snapshot() {
    return {
      entities: [...this.entities.values()].filter(e => e.layer === 'user'),
      triples: [...this.triples.values()].filter(t => t.layer === 'user'),
      overrides: this.overrides,
    };
  }

  persist() {
    if (!this.storage || !this.storageKey) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.snapshot()));
    } catch {
      /* storage may be full or unavailable – keep working in memory */
    }
  }

  /** Returns true when persisted user data was found and loaded. */
  restore() {
    if (!this.storage || !this.storageKey) return false;
    let data;
    try {
      data = JSON.parse(this.storage.getItem(this.storageKey) || 'null');
    } catch {
      return false;
    }
    if (!data) return false;
    this.batch(() => {
      this.overrides = data.overrides || {};
      for (const [id, patch] of Object.entries(this.overrides)) {
        const e = this.entities.get(id);
        if (e) this.entities.set(id, { ...e, ...patch });
      }
      for (const e of data.entities || []) {
        if (CLASSES[e.type]) this.entities.set(e.id, { ...e, layer: 'user' });
      }
      for (const t of data.triples || []) {
        try {
          this.addTriple(t.s, t.p, t.o, 'user');
        } catch {
          /* skip triples that no longer satisfy the schema */
        }
      }
      this.dirty = true;
    });
    return true;
  }

  /** Drops all knowledge (both layers) so the graph can be re-seeded. */
  reset() {
    this.entities.clear();
    this.triples.clear();
    this.overrides = {};
    if (this.storage && this.storageKey) {
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        /* ignore */
      }
    }
  }
}
