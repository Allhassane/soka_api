import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateUserDto } from './update-user.dto';

/**
 * Verrouille l'écart §C2 de l'audit du 2026-08-01.
 *
 * `UpdateUserDto` a été un `PartialType(CreateUserDto)` : tout porteur de `utilisateurs_modifier`
 * pouvait alors réécrire le **mot de passe**, le **téléphone** (= l'identifiant de connexion) ou le
 * **member_uuid** de n'importe quel compte, `is_admin` compris, puis se connecter à sa place -
 * `UserService.update()` faisant un `Object.assign(user, dto)` sans filtre ni contrôle de cible.
 *
 * Ces tests rejouent le **vrai** `ValidationPipe` de l'application, avec les mêmes options que
 * `main.ts:31-35`. Ils échouent si quelqu'un revient à `PartialType`.
 */
describe('UpdateUserDto (garde-fou §C2)', () => {
  // Mêmes options que le pipe global de main.ts.
  const pipe = new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    disableErrorMessages: false,
    validationError: { target: false },
  });

  const metadata = {
    type: 'body' as const,
    metatype: UpdateUserDto,
    data: '',
  };

  const doitEtreRejete = async (payload: Record<string, unknown>, champ: string) => {
    expect.assertions(2);
    try {
      await pipe.transform(payload, metadata);
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(BadRequestException);
      // Le détail du refus vit dans `getResponse().message` (tableau), PAS dans `.message`
      // qui vaut simplement « Bad Request Exception ». Un rejet muet enverrait sur une
      // fausse piste au moment du diagnostic : on vérifie que le champ est bien nommé.
      const reponse = (erreur as BadRequestException).getResponse() as {
        message?: string[] | string;
      };
      expect(JSON.stringify(reponse.message ?? '')).toContain(champ);
    }
  };

  it('refuse `password` (prise de contrôle directe du compte)', async () => {
    await doitEtreRejete({ password: 'motdepasse123' }, 'password');
  });

  it('refuse `phone_number` (identifiant de connexion, sans index UNIQUE en base)', async () => {
    await doitEtreRejete({ phone_number: '0700000000' }, 'phone_number');
  });

  it('refuse `member_uuid` (rattacherait la session à une autre personne)', async () => {
    await doitEtreRejete(
      { member_uuid: '13c7bc48-6e67-4d48-a53e-0c830dd63f90' },
      'member_uuid',
    );
  });

  it('refuse `is_admin` (élévation de privilège)', async () => {
    await doitEtreRejete({ is_admin: true }, 'is_admin');
  });

  it('refuse le champ interdit même noyé dans une charge par ailleurs valide', async () => {
    await doitEtreRejete(
      { firstname: 'Awa', lastname: 'Kone', password: 'motdepasse123' },
      'password',
    );
  });

  it('accepte les champs d’identité légitimes', async () => {
    const valide = await pipe.transform(
      {
        firstname: 'Awa',
        lastname: 'Kone',
        email: 'awa.kone@example.org',
        address: 'Abidjan',
        profil_picture: '/uploads/awa.png',
        is_active: false,
      },
      metadata,
    );
    expect(valide).toEqual({
      firstname: 'Awa',
      lastname: 'Kone',
      email: 'awa.kone@example.org',
      address: 'Abidjan',
      profil_picture: '/uploads/awa.png',
      is_active: false,
    });
  });

  it('accepte une charge vide (mise à jour partielle)', async () => {
    await expect(pipe.transform({}, metadata)).resolves.toEqual({});
  });

  it('valide toujours le format des champs conservés', async () => {
    await expect(
      pipe.transform({ email: 'pas-un-email' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
