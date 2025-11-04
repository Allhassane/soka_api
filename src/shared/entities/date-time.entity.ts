import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export class DateTimeEntity {
  @ApiProperty({
    description: 'Date de création',
  })
  @CreateDateColumn()
  created_at: Date;

  @ApiProperty({
    description: 'Date de dernière mise à jour',
  })
  @UpdateDateColumn()
  updated_at: Date;

  @ApiProperty({
    description: 'Date de suppression (soft delete)',
    nullable: true,
  })
  @DeleteDateColumn({ name: 'deleted_at' })
  deleted_at?: Date;
}
