// src/shared/utils/deep-clean.util.ts
const TECH_KEYS = new Set([
    'section_uuid',
    'section_form_campaign_uuid',
    'question_section_form_campaign_uuid',
  ]);
  
  export function deepOmitTechFields<T = any>(input: T): T {
    if (Array.isArray(input)) {
      return input.map(deepOmitTechFields) as unknown as T;
    }
    if (input && typeof input === 'object') {
      const out: any = {};
      for (const [k, v] of Object.entries(input as any)) {
        if (TECH_KEYS.has(k)) continue;        // <-- supprime les champs interdits
        out[k] = deepOmitTechFields(v);
      }
      return out as T;
    }
    return input;
  }
  