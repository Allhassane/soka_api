import { ImportService } from './import.service';

/**
 * Cause racine du défaut « membres sans matricule » (2026-09-08).
 *
 * `buildPayload()` recopiait la colonne « Matricule » du tableur **verbatim**, via un helper qui
 * **ignore les valeurs vides**. Combiné à un chemin `create` qui n'appelle pas
 * `MemberService.store()`, cela produisait des membres à `matricule NULL` (235 fiches) ou porteurs
 * du remplissage brut du tableur (31 fiches). Ces tests verrouillent le filtrage ; la génération
 * elle-même est couverte par `members/matricule.service.spec.ts`.
 */

/**
 * Tous les résolveurs de référentiel rendent `undefined` : ce test ne s'intéresse qu'à la colonne
 * « Matricule », et un `undefined` est écarté par le helper `put()` comme une cellule vide.
 */
const refStub: any = new Proxy(
  {},
  {
    get: (_cible, propriete) =>
      propriete === 'resolveStructure' ? () => ({ uuid: undefined }) : () => undefined,
  },
);

/** `buildPayload` est privé : on n'instancie que ce dont il se sert réellement. */
const service = new ImportService(
  refStub,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
);

const payloadPour = (matricule: string): Record<string, unknown> =>
  (service as any).buildPayload({ Matricule: matricule, Nom: 'TEST', Prénom: 'Test' });

describe('ImportService.buildPayload - colonne Matricule', () => {
  it('reprend un matricule au format canonique', () => {
    expect(payloadPour('26-7953').matricule).toBe('26-7953');
  });

  it('reprend la numérotation héritée - ce sont de vrais identifiants', () => {
    // 24 fiches en base en portent une ; les écraser détruirait de l'information.
    expect(payloadPour('0007283').matricule).toBe('0007283');
  });

  it('écarte une cellule vide - le matricule sera généré à la création', () => {
    expect(payloadPour('').matricule).toBeUndefined();
    expect(payloadPour('   ').matricule).toBeUndefined();
  });

  it('écarte le remplissage de tableur relevé en base', () => {
    // Les valeurs exactes trouvées sur les 271 membres créés par l'import.
    expect(payloadPour('Nouveau membre ou non digitalisé').matricule).toBeUndefined();
    expect(payloadPour("Ancien membre venu d'autre centre").matricule).toBeUndefined();
    expect(payloadPour('sss').matricule).toBeUndefined();
    expect(payloadPour('XXXXX').matricule).toBeUndefined();
    // Numéros de ligne : deux fichiers importés collisionneraient dès la première ligne.
    expect(payloadPour('1').matricule).toBeUndefined();
    expect(payloadPour('18').matricule).toBeUndefined();
  });

  it("laisse le reste du payload intact - le filtrage ne vise QUE le matricule", () => {
    const payload = payloadPour('sss');
    expect(payload.lastname).toBe('TEST');
    expect(payload.firstname).toBe('Test');
  });
});
