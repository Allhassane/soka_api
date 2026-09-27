import { AccessScopeService } from './access-scope.service';

/**
 * Périmètre des CHIFFRES FINANCIERS (RESPO-COMPTA-REGUL, 2026-09-27).
 *
 * Les fiches de campagne, la liste des paiements et l'export des responsables partaient de
 * `responsibilities[0]` (la PREMIÈRE responsabilité, ordre indéterminé, sans les comités) et ne
 * gardaient que les sous-groupes : la somme des régions tombait 35 paiements / 540 000 F sous le
 * chiffre de la Comptabilité. Le périmètre vient désormais du calcul canonique, tous niveaux, et
 * le national voit exactement ce que voit la Comptabilité.
 */
function makeService(options: { user?: any; racine?: string | null; parentDeLaRacine?: string | null }) {
  const dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM `users`') || sql.includes('FROM users')) {
        return options.user ? [options.user] : [];
      }
      if (sql.includes('parent_uuid FROM structures')) {
        return [{ parent_uuid: options.parentDeLaRacine ?? null }];
      }
      return [];
    }),
  };
  const service = new AccessScopeService(dataSource as never);
  const compute = jest
    .spyOn(service, 'compute')
    .mockResolvedValue({ scope_structure_uuid: options.racine ?? null } as never);
  const sousArbre = jest
    .spyOn(service, 'sousArbre')
    .mockResolvedValue(new Set(['region-1', 'district-1', 'groupe-1', 'sous-groupe-1']));
  return { service, compute, sousArbre };
}

const responsable = { uuid: 'u-1', member_uuid: 'm-1', is_admin: 0 };

describe('AccessScopeService.perimetreFinancier', () => {
  it('administrateur : global, aucun filtre', async () => {
    const { service, compute } = makeService({ user: { ...responsable, is_admin: 1 } });
    await expect(service.perimetreFinancier('u-1')).resolves.toEqual({
      structures: null,
      racine_uuid: null,
    });
    expect(compute).not.toHaveBeenCalled();
  });

  it('🚨 périmètre national (sa racine est celle de l\'organisation) : global, comme la Comptabilité', async () => {
    // Un paiement dont le bénéficiaire n'est rattaché à aucune structure n'appartient à aucune
    // région - mais il appartient à l'organisation : le national doit le compter.
    const { service, sousArbre } = makeService({ user: responsable, racine: 'national', parentDeLaRacine: null });
    await expect(service.perimetreFinancier('u-1')).resolves.toEqual({
      structures: null,
      racine_uuid: 'national',
    });
    expect(sousArbre).not.toHaveBeenCalled();
  });

  it('région : son sous-arbre COMPLET, tous niveaux - pas seulement les sous-groupes', async () => {
    const { service, compute, sousArbre } = makeService({
      user: responsable, racine: 'region-1', parentDeLaRacine: 'national',
    });

    const perimetre = await service.perimetreFinancier('u-1');

    expect(compute).toHaveBeenCalledWith({ uuid: 'u-1', member_uuid: 'm-1', is_admin: false });
    expect(sousArbre).toHaveBeenCalledWith('region-1');
    expect(perimetre.racine_uuid).toBe('region-1');
    expect([...(perimetre.structures ?? [])]).toEqual(
      expect.arrayContaining(['region-1', 'district-1', 'groupe-1', 'sous-groupe-1']),
    );
  });

  it('sans structure résolue : ne voit RIEN, jamais « tout »', async () => {
    const { service } = makeService({ user: responsable, racine: null });
    const perimetre = await service.perimetreFinancier('u-1');
    expect(perimetre.structures?.size).toBe(0);
  });

  it('utilisateur inconnu : ne voit rien', async () => {
    const { service } = makeService({ user: null });
    const perimetre = await service.perimetreFinancier('inconnu');
    expect(perimetre.structures?.size).toBe(0);
  });
});
