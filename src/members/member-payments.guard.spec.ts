import { ConflictException } from '@nestjs/common';
import { assertAucunPaiementReussi } from './member-payments.guard';
import { MemberService } from './member.service';

/**
 * RESPO-COMPTA-REGUL (2026-09-27) : une fiche membre qui porte un paiement RÉUSSI ne se supprime
 * plus. Trois paiements (45 000 F) étaient restés accrochés à des doublons supprimés : lignes
 * anonymes dans l'export comptable, et membres qui, sur leur fiche conservée, paraissaient ne
 * jamais avoir payé - donc libres de payer une seconde fois.
 */
describe('assertAucunPaiementReussi', () => {
  it('🚨 refuse une fiche qui porte un paiement réussi, comme payeur ou comme bénéficiaire', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ n: '2' }]) };

    const refus = assertAucunPaiementReussi(manager as never, 'm-1');

    await expect(refus).rejects.toBeInstanceOf(ConflictException);
    await expect(refus).rejects.toMatchObject({
      response: { data: { code: 'MEMBRE_AVEC_PAIEMENTS', paiements: 2 } },
    });
    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain("payment_status = 'paid'");
    expect(sql).toContain('actor_uuid = ?');
    expect(sql).toContain('beneficiary_uuid = ?');
    expect(params).toEqual(['m-1', 'm-1']);
  });

  it('laisse passer une fiche sans paiement réussi (tentatives échouées comprises)', async () => {
    const manager = { query: jest.fn().mockResolvedValue([{ n: '0' }]) };
    await expect(assertAucunPaiementReussi(manager as never, 'm-1')).resolves.toBeUndefined();
  });
});

describe('MemberService.delete - le refus arrive AVANT toute écriture', () => {
  it('ne supprime rien quand la fiche porte un paiement réussi', async () => {
    const transaction = jest.fn();
    const service: any = Object.create(MemberService.prototype);
    service.userRepo = { findOne: jest.fn().mockResolvedValue({ uuid: 'u-1' }) };
    service.memberRepo = {
      findOne: jest.fn().mockResolvedValue({ uuid: 'm-1', structure_uuid: 's-1' }),
      manager: { query: jest.fn().mockResolvedValue([{ n: '1' }]), transaction },
    };
    service.assertStructureInScope = jest.fn().mockResolvedValue(undefined);

    await expect(service.delete('m-1', 'u-1')).rejects.toMatchObject({
      response: { data: { code: 'MEMBRE_AVEC_PAIEMENTS' } },
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
