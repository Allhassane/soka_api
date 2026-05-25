// dto/tree.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ResponsibleInfoDto {
  @ApiProperty({
    description: 'UUID du membre responsable',
    example: 'mem-001',
  })
  member_uuid: string;

  @ApiProperty({
    description: 'Nom complet du membre',
    example: 'Jean Dupont',
  })
  member_name: string;

  @ApiProperty({
    description: 'UUID de la responsabilité',
    example: 'resp-001',
  })
  responsibility_uuid: string;

  @ApiProperty({
    description: 'Libellé de la responsabilité',
    example: 'Responsable Région',
  })
  responsibility_name: string;
}

export class StructureTreeNodeDto {
  @ApiProperty({
    description: 'UUID de la structure',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  uuid: string;

  @ApiProperty({
    description: 'Nom de la structure',
    example: 'LUTTER ENSEMBLE',
  })
  name: string;

  @ApiProperty({
    description: 'UUID du niveau',
    example: 'lvl-002',
    nullable: true,
  })
  level_uuid: string | null;

  @ApiProperty({
    description: 'Nom du niveau',
    example: 'REGION',
  })
  level_name: string;

  @ApiProperty({
    description: 'UUID de la structure parente',
    example: 'nat-001',
    nullable: true,
  })
  parent_uuid: string | null;

  @ApiProperty({
    description: 'Nombre de membres directement rattachés',
    example: 3,
  })
  direct_members_count: number;

  @ApiProperty({
    description: 'Nombre total de membres (cumulatif)',
    example: 80,
  })
  total_members_count: number;

  @ApiProperty({
    description: 'Nombre de sous-groupes',
    example: 15,
  })
  sub_groups_count: number;

  @ApiProperty({
    description: 'UUIDs de tous les sous-groupes',
    type: [String],
    example: ['ctr-001', 'grp-001', 'sg-001'],
  })
  sub_groups_uuids: string[];

  @ApiProperty({
    description: 'Liste des responsables de la structure',
    type: [ResponsibleInfoDto],
  })
  responsibles: ResponsibleInfoDto[];

  @ApiProperty({
    description: 'Structures enfants imbriquées',
    type: () => [StructureTreeNodeDto],
  })
  children: StructureTreeNodeDto[];
}
