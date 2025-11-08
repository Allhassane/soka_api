import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsUUID,
} from 'class-validator';

export class CreateMemberDto {
  @ApiProperty({ description: 'Nom complet du membre' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: "URL ou chemin de la photo du membre" })
  @IsOptional()
  @IsString()
  picture?: string;

  @ApiPropertyOptional({ description: 'Matricule interne du membre' })
  @IsOptional()
  @IsString()
  matricule?: string;

  @ApiProperty({ description: 'Nom du membre' })
  @IsString()
  firstname: string;

  @ApiProperty({ description: 'Prénom du membre' })
  @IsString()
  lastname: string;

  @ApiProperty({ enum: ['homme', 'femme'], description: 'Genre du membre' })
  @IsEnum(['homme', 'femme'])
  gender: string;

  @ApiPropertyOptional({ description: 'Date de naissance du membre (AAAA-MM-JJ)' })
  @IsOptional()
  @IsDateString()
  birth_date?: string;

  @ApiPropertyOptional({ description: 'Ville de naissance' })
  @IsOptional()
  @IsString()
  birth_city?: string;

  @ApiPropertyOptional({ description: 'UUID de la civilité' })
  @IsOptional()
  @IsUUID()
  civility_uuid?: string;

  @ApiPropertyOptional({ description: 'UUID du statut matrimonial' })
  @IsOptional()
  @IsUUID()
  marital_status_uuid?: string;

  @ApiPropertyOptional({ description: 'Prénom du conjoint' })
  @IsOptional()
  @IsString()
  spouse_firstname?: string;

  @ApiPropertyOptional({ description: 'Nom du conjoint' })
  @IsOptional()
  @IsString()
  spouse_lastname?: string;

  @ApiPropertyOptional({ description: 'Le conjoint est aussi membre ?' })
  @IsOptional()
  @IsBoolean()
  spouse_member?: boolean;

  @ApiPropertyOptional({ description: "Nombre d'enfants" })
  @IsOptional()
  @IsNumber()
  childrens?: number;

  @ApiPropertyOptional({ description: 'UUID du pays de nationalité' })
  @IsOptional()
  @IsUUID()
  country_uuid?: string;

  @ApiPropertyOptional({ description: 'UUID de la ville du membre' })
  @IsOptional()
  @IsUUID()
  city_uuid?: string;

  @ApiPropertyOptional({ description: 'Nom du quartier ou localité' })
  @IsOptional()
  @IsString()
  town?: string;

  @ApiPropertyOptional({ description: 'UUID de la formation du membre' })
  @IsOptional()
  @IsUUID()
  formation_uuid?: string;

  @ApiPropertyOptional({ description: 'UUID du métier/emploi du membre' })
  @IsOptional()
  @IsUUID()
  job_uuid?: string;

  @ApiPropertyOptional({ description: 'Numéro de téléphone principal' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Numéro WhatsApp' })
  @IsOptional()
  @IsString()
  phone_whatsapp?: string;

  @ApiPropertyOptional({ description: 'Adresse e-mail du membre' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Prénom du tuteur' })
  @IsOptional()
  @IsString()
  tutor_firstname?: string;

  @ApiPropertyOptional({ description: 'Nom du tuteur' })
  @IsOptional()
  @IsString()
  tutor_lastname?: string;

  @ApiPropertyOptional({ description: 'Téléphone du tuteur' })
  @IsOptional()
  @IsString()
  tutor_phone?: string;

  @ApiPropertyOptional({ description: "UUID de la ville d'organisation" })
  @IsOptional()
  @IsUUID()
  organisation_city_uuid?: string;

  @ApiPropertyOptional({ description: "Date d'adhésion" })
  @IsOptional()
  @IsDateString()
  membership_date?: string;

  @ApiPropertyOptional({ description: 'Appartient à Sokahan/Byakuren' })
  @IsOptional()
  @IsBoolean()
  sokahan_byakuren?: boolean;

  @ApiPropertyOptional({ description: 'UUID du département' })
  @IsOptional()
  @IsUUID()
  department_uuid?: string;

  @ApiPropertyOptional({ description: 'UUID de la division' })
  @IsOptional()
  @IsUUID()
  division_uuid?: string;

  @ApiPropertyOptional({ description: 'UUID de la responsabilité du membre' })
  @IsOptional()
  @IsUUID()
  responsibility_uuid?: string;

  
  @ApiPropertyOptional({ description: 'Liste des UUIDs des accessoires du membre', type: [String] })
  @IsOptional()
  @IsUUID('all', { each: true })
  accessories?: string[];
    
  @ApiPropertyOptional({ description: 'Possède un Gohonzon' })
  @IsOptional()
  @IsBoolean()
  has_gohonzon?: boolean;

  @ApiPropertyOptional({ description: 'Date de réception du Gohonzon' })
  @IsOptional()
  @IsDateString()
  date_gohonzon?: string;

  @ApiPropertyOptional({ description: 'Possède un Tokusso' })
  @IsOptional()
  @IsBoolean()
  has_tokusso?: boolean;

  @ApiPropertyOptional({ description: 'Date du Tokusso' })
  @IsOptional()
  @IsDateString()
  date_tokusso?: string;

  @ApiPropertyOptional({ description: 'Possède un Omamori' })
  @IsOptional()
  @IsBoolean()
  has_omamori?: boolean;

  @ApiPropertyOptional({ description: 'Date du Omamori' })
  @IsOptional()
  @IsDateString()
  date_omamori?: string;

  @ApiPropertyOptional({ description: 'ID numérique de la structure (optionnel)' })
  @IsOptional()
  @IsNumber()
  structure_id?: number;

  @ApiPropertyOptional({ description: 'UUID de la structure' })
  @IsOptional()
  @IsUUID()
  structure_uuid?: string;

  @ApiProperty({ description: "UUID de l'administrateur ayant créé le membre" })
  @IsUUID()
  admin_uuid: string;

  @ApiPropertyOptional({ description: 'Statut du membre', default: 'enable' })
  @IsOptional()
  @IsString()
  status?: string;
}
