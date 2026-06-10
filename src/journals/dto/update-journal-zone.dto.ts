import { PartialType } from '@nestjs/swagger';
import { CreateJournalZoneDto } from './create-journal-zone.dto';

export class UpdateJournalZoneDto extends PartialType(CreateJournalZoneDto) {}
