/**
 * Racines du périmètre d'un utilisateur, lues sur le payload JWT (`req.user`).
 *
 * Depuis l'unification du calcul de portée, le token porte `scope_structure_uuid` : la structure
 * du **niveau le plus élevé** que l'utilisateur peut atteindre, tous chemins confondus
 * (responsabilités ET comités). Comme tous les paliers accessibles sont des ancêtres d'une même
 * chaîne, le sous-arbre de cette seule racine **contient** ceux de tous les paliers inférieurs :
 * une racine suffit, et elle couvre l'élargissement par les comités que l'ancienne dérivation
 * (`responsibilities[].structure.uuid`) ignorait.
 *
 * Le repli sur `responsibilities[]` sert aux **sessions déjà ouvertes** : les tokens émis avant
 * cette évolution n'ont pas le champ. Il disparaîtra naturellement à l'expiration (~1 h).
 *
 * Fonction pure, sans injection : elle est appelée depuis des contrôleurs qui n'ont que `req`.
 */
export function allowedRootUuidsFromJwt(user: any): string[] {
  if (user?.scope_structure_uuid) return [user.scope_structure_uuid];

  return (user?.responsibilities ?? [])
    .map((r: any) => r?.structure?.uuid)
    .filter((uuid: any): uuid is string => !!uuid);
}
