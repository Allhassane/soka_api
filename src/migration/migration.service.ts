import { Injectable, NotFoundException } from '@nestjs/common';
import { CivilityService } from 'src/civilities/civility.service';
import { CreateCivilityDto } from 'src/civilities/dto/create-civility.dto';
import { CountryService } from 'src/countries/country.service';
import { DepartmentService } from 'src/departments/department.service';
import { CreateDepartmentDto } from 'src/departments/dto/create-department.dto';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DivisionService } from 'src/divisions/division.service';
import { CreateDivisionDto } from 'src/divisions/dto/create-division.dto';
import { MaritalStatusService } from 'src/marital-status/marital-status.service';
import { MemberService } from 'src/members/member.service';
import { CityService } from 'src/cities/city.service';
import { FormationService } from 'src/formations/formation.service';
import { JobService } from 'src/jobs/job.service';
import { v4 as uuidv4 } from 'uuid';
import { OrganisationCityService } from 'src/organisation_cities/organisation_city.service';
import { StructureService } from 'src/structure/structure.service';
import { ResponsibilityService } from 'src/responsibilities/reponsibility.service';
import { LevelService } from 'src/level/level.service';
import { CreateMemberDto } from 'src/members/dto/create-member.dto';
import { AccessoryService } from 'src/accessories/accessory.service';
import { CreateAccessoryDto } from 'src/accessories/dto/create-accessory.dto';
import { MemberAccessoryService } from 'src/member-accessories/member-accessories.service';
import { MemberResponsibilityService } from 'src/⁠member-responsibility/⁠member-responsibility.service';
import { CreateMemberResponsibilityDto } from 'src/⁠member-responsibility/dto/create-member-responsibility.dto';
import { slugify } from 'src/shared/functions/slug';
import { CreateLevelDto } from 'src/level/dto/create-level.dto';
import { CreateStructureDto } from 'src/structure/dto/create-structure.dto';
import { MIGRATION_URL } from 'src/shared/constants/constants';
import { UserService } from 'src/users/user.service';
import { CreateUserDto } from 'src/users/dtos/create-user.dto';

@Injectable()
export class MigrationService {
    constructor(
        private readonly departmentService : DepartmentService,
        private readonly divisionService : DivisionService,
        private readonly civilityService : CivilityService,
        private readonly memberService : MemberService,
        private readonly maritalStatusService : MaritalStatusService,
        private readonly countryService : CountryService,
        private readonly cityService : CityService,
        private readonly formationService : FormationService,
        private readonly jobService : JobService,
        private readonly organisationCityService : OrganisationCityService,
        private readonly structureService : StructureService,
        private readonly responsibilityService : ResponsibilityService,
        private readonly levelService : LevelService,
        private readonly accessoryService : AccessoryService,
        private readonly memberAccessoryService : MemberAccessoryService,
        private readonly memberResponsibilityService : MemberResponsibilityService,
        private readonly userService : UserService,
    ){}

    async migrate(option: string, admin_uuid: string) {
        
        const migration_url = 'https://dev.sokagakkaici.org/api/v1';

        console.log(migration_url + '/migration?option=' + option);
        const query = await fetch(migration_url + '/migration?option=' + option);
        const response = await query.json();

        const data = response.data;

        if(option == 'departments'){
            for(const item of data){
                const prepare: CreateDepartmentDto = {
                    uuid: item.id,
                    name: item.name,
                    description: item.description,
                }

                const department = await this.departmentService.findOneByName(item.name);
                if(!department){
                    await this.departmentService.store(prepare, admin_uuid);
                }
            }
        }else if(option == 'divisions'){
            const find_department = await this.departmentService.findOneByName("JEUNESSE");

            if(find_department){
                for(const item of data){
                    let gender: "mixte" | "homme" | "femme" = "mixte";
                    const searchGender = item.name.toLowerCase();
                    if(searchGender.includes("homme")){
                        gender = "homme";
                    }else if(searchGender.includes("femme")){
                        gender = "femme";
                    }
                    const prepare: CreateDivisionDto = {
                        uuid: item.id,
                        department_uuid: find_department.uuid,
                        name: item.name,
                        description: "",
                        gender: gender,
                    }

                    const division = await this.divisionService.findOneByName(item.name);
                    if(!division){
                        await this.divisionService.store(prepare, admin_uuid);
                    }
                }
            }
        }else if(option == 'civilities'){
            for(const item of data){
                const prepare: CreateCivilityDto = {
                    name: item.name,
                    sigle: item.sigle,
                    gender: item.gender,
                    status: item.status,
                }

                const civility = await this.civilityService.findOneByName(item.name);
                if(!civility){
                    await this.civilityService.store(prepare, admin_uuid);
                }
            }
        }else if(option == 'accessories'){
            for(const item of data){
                const prepare: CreateAccessoryDto = {
                    name: item.name,
                    from_last_version: item.migration,
                }

                const accessory = await this.accessoryService.findOneByLastVersionName(item.migration);
                if(!accessory){
                    await this.accessoryService.store(prepare, admin_uuid);
                }
            }
        }else if(option == "structures"){

            const {levels, structures} = data;
            
            for(const item of levels){
                const prepare: CreateLevelDto = {
                    uuid: item.id,
                    name: item.name,
                    order: item.order+1,
                    category: "level",
                }

                let level = await this.levelService.findOneByName(item.name);
                if(!level){
                    level = await this.levelService.create(prepare);
                }

                const queryStructs = await fetch(migration_url +'/migration/find-structure-by-level?level_id=' + level.uuid);
                const results = await queryStructs.json();

                const structs = results.data;

                for(const struct of structs){
                    let parent;
                    if(struct.parent_id){
                        parent = await this.structureService.findOne(struct.parent_id);
                    }
                    const prepareStruct: CreateStructureDto = {
                        uuid: struct.id,
                        name: struct.name,
                        parent_uuid: parent ? parent.uuid : null,
                    }
                    await this.structureService.create(prepareStruct);
                }

            }

        }else if(option == 'members'){
            
            let x = 0;
            for(const member of data){
                x++;
                const findMember = await this.memberService.findOneByUuid(member.id);

                if(!findMember){

                    // situation matrimonal
                    const maritalStatus = await this.maritalStatusService.findOneByName(member.situation_matrimoniale);
                    if(!maritalStatus){
                        await this.maritalStatusService.store({
                            name: member.situation_matrimoniale,
                            description: "",
                        }, admin_uuid);
                    }
                    console.log('maritalStatus ................... OK');
                    
                    // pays
                    let country;
                    if(member.nationalite){
                        const verifyCountry = member.nationalite.toLowerCase();
                        let countryName = ""
                        if(verifyCountry == "japan"){
                            countryName = "JAPON"
                        }else{
                            countryName = member.nationalite
                        }
                        let country = await this.countryService.findOneByName(countryName.toUpperCase());
                        if(!country){
                            country = await this.countryService.store({
                                name: "COTE D'IVOIRE",
                                description: "",
                            }, admin_uuid);
                        }
                    }
                    
                    !country ? country = await this.countryService.store({
                            name: "COTE D'IVOIRE",
                            description: "",
                        }, admin_uuid) : null;

                    console.log('country ................... OK');

                    
                    // civility
                    let civility = await this.civilityService.findOneByName(member.civility);
                    if(!civility){
                        await this.civilityService.store("homme", admin_uuid);
                    }
                    console.log('civility ................... OK');
                    
                    // city
                    let cityUuid : string | undefined = undefined;
                    if(member.localite_residence){
                        let city = await this.cityService.findOneBySlug(slugify(member.localite_residence));

                        if(!city){
                            city = await this.cityService.store({
                                uuid: uuidv4(),
                                name: member.localite_residence,
                                description: "",
                            }, admin_uuid);
                        }
                        cityUuid = city.uuid;
                    }
                    console.log('city ................... OK');
                    
                    // formation
                    let formationUuid : string | undefined = undefined;
                    if(member.profession){
                        let formation = await this.formationService.findOneBySlug(slugify(member.profession));

                        if(!formation){
                            formation = await this.formationService.store({
                                uuid: uuidv4(),
                                name: member.profession,
                                description: "",
                            }, admin_uuid);
                        }
                        formationUuid = formation.uuid;
                    }
                    console.log('formation ................... OK');
                    
                    // job
                    let jobUuid : string | undefined = undefined;
                    if(member.metier){
                        let job = await this.jobService.findOneBySlug(slugify(member.metier));

                        if(!job){
                            job = await this.jobService.store({
                                uuid: uuidv4(),
                                name: member.metier,
                                description: "",
                            }, admin_uuid);
                        }
                        jobUuid = job.uuid;
                    }
                    console.log('job ................... OK');
                    
                    // organisation city
                    let organisationUuid : string | undefined = undefined;
                    if(member.ville_rattachement){
                        let organisation = await this.organisationCityService.findOneBySlug(slugify(member.ville_rattachement));

                        if(!organisation){
                            organisation = await this.organisationCityService.store({
                                uuid: uuidv4(),
                                name: member.ville_rattachement,
                                description: "",
                            }, admin_uuid);
                        }
                        organisationUuid = organisation.uuid;
                    }
                    console.log('organisation ................... OK');
                    
                    // departmentUuid 
                    let departmentUuid : string | undefined = undefined;
                    if(member.departement){
                        let department = await this.departmentService.findOne(member.departement, admin_uuid);
                        departmentUuid = department.uuid;
                    }
                    console.log('department ................... OK');
                    
                    // division
                    let divisionUuid : string | undefined = undefined;
                    if(member.division){
                        let division = await this.divisionService.findOne(member.division, admin_uuid);
                        divisionUuid = division.uuid;
                    }
                    console.log('division ................... OK');
                    
                    // structure
                    let structure = await this.structureService.findOne(member.structure_id);
                    console.log('structure ................... OK');
                    
                    // responsability
                    let responsibilityUuid : string | undefined = undefined;
                    if(member.type_responsabilite){

                        let gender: "mixte" | "homme" | "femme" = "mixte";
                        const searchGender = member.type_responsabilite.toLowerCase();
                        if(searchGender.includes("homme")){
                            gender = "homme";
                        }else if(searchGender.includes("femme")){
                            gender = "femme";
                        }

                        const level = await this.levelService.findOneByName(member.niveau_responsabilite);
                        if(level){

                            let responsibility = await this.responsibilityService.findOneBySlug(slugify(member.type_responsabilite));
                            if(!responsibility){
                                responsibility = await this.responsibilityService.store({
                                    uuid: uuidv4(),
                                    name: member.type_responsabilite,
                                    description: "",
                                    level_uuid: level.uuid,
                                    level: level,
                                    gender: gender,
                                }, admin_uuid);
                            }
                            responsibilityUuid = responsibility.uuid;
                        }
                    }
                    console.log('responsability ................... ' + responsibilityUuid);

                    const verifyPhoneQuery = await this.memberService.verifyPhoneNumber({phone: member.contact, category: 'principal'});
                    
                    let member_phone = undefined;
                    if(member.contact){
                        member_phone = verifyPhoneQuery.is_available ? member.contact : undefined;
                    }

                    const prepareSaveMember: CreateMemberDto = {
                        picture: member.picture,
                        matricule: member.matricule,
                        firstname: member.nom,
                        lastname: member.prenom,
                        gender: civility?.gender as string,
                        birth_date: member.date_naissance ?? null,
                        birth_city: member.lieu_naissance ?? null,
                        civility_uuid: civility?.uuid,
                        marital_status_uuid: maritalStatus?.uuid,
                        spouse_name: member.nom_conjoint ?? null,
                        spouse_member: member.conjoint_membre ?? false,
                        childrens: member.nb_enfants ?? 0,
                        country_uuid: country?.uuid,
                        city_uuid: cityUuid,
                        town: member.ville_residence ?? null,
                        formation_uuid: formationUuid,
                        job_uuid: jobUuid,
                        phone: member_phone,
                        phone_whatsapp: member.whatsapp ?? null,
                        email: member.email ?? null,
                        tutor_name: member.contact_urgence_nom ?? null,
                        tutor_phone: member.contact_urgence_numero ?? null,
                        organisation_city_uuid: organisationUuid,
                        membership_date: member.debut_pratique ?? null,
                        sokahan_byakuren: member.sokahan_byakuren ?? false,
                        department_uuid: departmentUuid,
                        division_uuid: divisionUuid,
                        responsibility_uuid: responsibilityUuid,
                        accessories: member.accessories ?? [],
                        has_gohonzon: member.possede_gohonzon ?? false,
                        date_gohonzon: member.date_gohonzon ?? null,
                        has_tokusso: member.possede_tokusso ?? false,
                        date_tokusso: member.date_tokusso ?? null,
                        has_omamori: member.possede_omamori ?? false,
                        date_omamori: member.date_omamori ?? null,
                        structure_id: structure.id,
                        structure_uuid: structure.uuid,
                        status: 'success',
                    }

                
                    console.log(prepareSaveMember);
                    const saveMember = await this.memberService.storeFromMigration({...prepareSaveMember, uuid: member.id}, admin_uuid);
                    console.log('member ................... OK');
                    
                    // creation du compte utilisateur lié au membre
                    if(member_phone != undefined){

                        const prepareUser : CreateUserDto = {
                            phone_number: member_phone,
                            email: member.user_email,
                            firstname: saveMember.firstname,
                            lastname: saveMember.lastname,
                            password: member.user_password_no_hashed,
                            is_active: true,
                            member_uuid: saveMember.uuid,
                        };

                        await this.userService.createUserByMigration(prepareUser);
                        console.log('user ................... OK');
                    }

                    if(member.accessoires){
                        const tmp_accessories = member.accessoires.split(',');
                        const accessories = JSON.parse(tmp_accessories);

                        for(const accessory of accessories){
                            const findAccessory = await this.accessoryService.findOneByLastVersionName(accessory);

                            if (!findAccessory) {
                                throw new NotFoundException('Aucun accessoire trouvé');
                            }

                            const accessoryEntity = await this.memberAccessoryService.findOneMemberAndAccessory(saveMember.uuid, findAccessory.uuid);
                            
                            if(!accessoryEntity){
                                await this.memberAccessoryService.create({
                                    member_uuid: saveMember.uuid,
                                    accessory_uuid: findAccessory.uuid,
                                });
                            }
                        }
                    }
                    console.log('member accessories ................... OK');

                    if(responsibilityUuid !== undefined){
                        console.log(responsibilityUuid);
                        const memberResponsibility = await this.memberResponsibilityService.findOneByResponsibilityAndMember(saveMember.uuid, responsibilityUuid);
                        
                        if(!memberResponsibility){
                            await this.memberResponsibilityService.create({
                                member_uuid: saveMember.uuid,
                                responsibility_uuid: responsibilityUuid,
                                priority: 'high',
                            }, admin_uuid);
                        }
                    }
                    console.log('member responsability ................... OK');

                    console.log('################################################################################## ' + x);
                }
            }
        }

        return {
            message: 'Données migrées avec succès',
        };
    }
}
