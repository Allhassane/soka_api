import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './entities/country.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}


    async onModuleInit() {
    // Vérifie si la table contient déjà tes pays (pas juste > 0)
    const existingCountries = await this.countryRepo.find({
      select: ['name'],
    });

    const existingNames = new Set(existingCountries.map((c) => c.name.trim().toUpperCase()));

    const paysList = [
      { name: 'AFGHANISTAN', capital: 'KABOUL', continent: 'ASIE', status: 'enable' },
      { name: 'AFRIQUE DU SUD', capital: 'PRETORIA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'ALBANIE', capital: 'TIRANA', continent: 'EUROPE', status: 'enable' },
      { name: 'ALGERIE', capital: 'ALGER', continent: 'AFRIQUE', status: 'enable' },
      { name: 'ALLEMAGNE', capital: 'BERLIN', continent: 'EUROPE', status: 'enable' },
      { name: 'ANDORRE', capital: 'ANDORRE-LA-VIEILLE', continent: 'EUROPE', status: 'enable' },
      { name: 'ANGLETERRE', capital: 'LONDRES', continent: 'EUROPE', status: 'enable' },
      { name: 'ANGOLA', capital: 'LUANDA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'ARABIE SAOUDITE', capital: 'RIYAD', continent: 'ASIE', status: 'enable' },
      { name: 'ARGENTINE', capital: 'BUENOS AIRES', continent: 'AMERIQUE', status: 'enable' },
      { name: 'ARMENIE', capital: 'EREVAN', continent: 'ASIE', status: 'enable' },
      { name: 'ANTIGUA-ET-BARBUDA', capital: "SAINT JOHN'S", continent: 'AMERIQUE', status: 'enable' },
      { name: 'AUSTRALIE', capital: 'CANBERRA', continent: 'OCEANIE', status: 'enable' },
      { name: 'AUTRICHE', capital: 'VIENNE', continent: 'EUROPE', status: 'enable' },
      { name: 'AZERBAIDJAN', capital: 'BAKOU', continent: 'ASIE', status: 'enable' },
      { name: 'BAHAMAS', capital: 'NASSAU', continent: 'AMERIQUE', status: 'enable' },
      { name: 'BAHREIN', capital: 'MANAMA', continent: 'ASIE', status: 'enable' },
      { name: 'BANGLADESH', capital: 'DACCA', continent: 'ASIE', status: 'enable' },
      { name: 'BARBADE', capital: 'BRIDGETOWN', continent: 'AMERIQUE', status: 'enable' },
      { name: 'BELGIQUE', capital: 'BRUXELLES', continent: 'EUROPE', status: 'enable' },
      { name: 'BELIZE', capital: 'BELMOPAN', continent: 'AMERIQUE', status: 'enable' },
      { name: 'BENIN', capital: 'PORTO-NOVO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'BHOUTAN', capital: 'THIMBU', continent: 'ASIE', status: 'enable' },
      { name: 'BIELORUSSIE', capital: 'MINSK', continent: 'EUROPE', status: 'enable' },
      { name: 'BIRMANIE', capital: 'RANGOUN', continent: 'ASIE', status: 'enable' },
      { name: 'BOLIVIE', capital: 'SUCRE', continent: 'AMERIQUE', status: 'enable' },
      { name: 'BOSNIE-HERZEGOVINE', capital: 'SARAJEVO', continent: 'EUROPE', status: 'enable' },
      { name: 'BOTSWANA', capital: 'GABORONE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'BRESIL', capital: 'BRASILIA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'BRUNEI', capital: 'BANDAR SERI BEGAWAN', continent: 'ASIE', status: 'enable' },
      { name: 'BULGARIE', capital: 'SOFIA', continent: 'EUROPE', status: 'enable' },
      { name: 'BURKINA FASO', capital: 'OUAGADOUGOU', continent: 'AFRIQUE', status: 'enable' },
      { name: 'BURUNDI', capital: 'BUJUMBURA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'CAMBODGE', capital: 'PHNOM PENH', continent: 'ASIE', status: 'enable' },
      { name: 'CAMEROUN', capital: 'YAOUNDE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'CANADA', capital: 'OTTAWA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'CAP-VERT', capital: 'PRAIA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'CHILI', capital: 'SANTIAGO', continent: 'AMERIQUE', status: 'enable' },
      { name: 'CHINE', capital: 'PEKIN', continent: 'ASIE', status: 'enable' },
      { name: 'CHYPRE', capital: 'NICOSIE', continent: 'EUROPE', status: 'enable' },
      { name: 'COLOMBIE', capital: 'BOGOTA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'COMORES', capital: 'MORONI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'CONGO', capital: 'BRAZZAVILLE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'COREE DU NORD', capital: 'PYONGYANG', continent: 'ASIE', status: 'enable' },
      { name: 'COREE DU SUD', capital: 'SEOUL', continent: 'ASIE', status: 'enable' },
      { name: 'COSTA RICA', capital: 'SAN JOSE', continent: 'AMERIQUE', status: 'enable' },
      { name: "COTE D'IVOIRE", capital: 'YAMOUSSOUKRO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'CROATIE', capital: 'ZAGREB', continent: 'EUROPE', status: 'enable' },
      { name: 'CUBA', capital: 'LA HAVANE', continent: 'AMERIQUE', status: 'enable' },
      { name: 'DANEMARK', capital: 'COPENHAGUE', continent: 'EUROPE', status: 'enable' },
      { name: 'DJIBOUTI', capital: 'DJIBOUTI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'DOMINIQUE', capital: 'ROSEAU', continent: 'AMERIQUE', status: 'enable' },
      { name: 'ECOSSE', capital: 'EDIMBOURG', continent: 'EUROPE', status: 'enable' },
      { name: 'EGYPTE', capital: 'LE CAIRE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'EMIRATS ARABES UNIS', capital: 'ABU DHABI', continent: 'ASIE', status: 'enable' },
      { name: 'EQUATEUR', capital: 'QUITO', continent: 'AMERIQUE', status: 'enable' },
      { name: 'ERYTHREE', capital: 'ASMARA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'ESPAGNE', capital: 'MADRID', continent: 'EUROPE', status: 'enable' },
      { name: 'ESTONIE', capital: 'TALLINN', continent: 'EUROPE', status: 'enable' },
      { name: 'ETATS-UNIS', capital: 'WASHINGTON', continent: 'AMERIQUE', status: 'enable' },
      { name: 'ETHIOPIE', capital: 'ADDIS-ABEBA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'FIDJI', capital: 'SUVA', continent: 'OCEANIE', status: 'enable' },
      { name: 'FINLANDE', capital: 'HELSINKI', continent: 'EUROPE', status: 'enable' },
      { name: 'FRANCE', capital: 'PARIS', continent: 'EUROPE', status: 'enable' },
      { name: 'GABON', capital: 'LIBREVILLE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GAMBIE', capital: 'BANJUL', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GEORGIE', capital: 'TBILISSI', continent: 'ASIE', status: 'enable' },
      { name: 'GHANA', capital: 'ACCRA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GRECE', capital: 'ATHENES', continent: 'EUROPE', status: 'enable' },
      { name: 'GRENADE', capital: "SAINT GEORGE'S", continent: 'AMERIQUE', status: 'enable' },
      { name: 'GUATEMALA', capital: 'GUATEMALA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'GUINEE', capital: 'CONAKRY', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GUINEE EQUATORIALE', capital: 'MALABO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GUINEE-BISSAU', capital: 'BISSAU', continent: 'AFRIQUE', status: 'enable' },
      { name: 'GUYANA', capital: 'GEORGETOWN', continent: 'AMERIQUE', status: 'enable' },
      { name: 'HAITI', capital: 'PORT-AU-PRINCE', continent: 'AMERIQUE', status: 'enable' },
      { name: 'HONDURAS', capital: 'TEGUCIGALPA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'HONGRIE', capital: 'BUDAPEST', continent: 'EUROPE', status: 'enable' },
      { name: 'ILE MAURICE', capital: 'PORT LOUIS', continent: 'AFRIQUE', status: 'enable' },
      { name: 'INDE', capital: 'NEW DELHI', continent: 'ASIE', status: 'enable' },
      { name: 'INDONESIE', capital: 'JAKARTA', continent: 'ASIE', status: 'enable' },
      { name: 'IRAK', capital: 'BAGDAD', continent: 'ASIE', status: 'enable' },
      { name: 'IRAN', capital: 'TEHERAN', continent: 'ASIE', status: 'enable' },
      { name: 'IRLANDE', capital: 'DUBLIN', continent: 'EUROPE', status: 'enable' },
      { name: 'IRLANDE DU NORD', capital: 'BELFAST', continent: 'EUROPE', status: 'enable' },
      { name: 'ISLANDE', capital: 'REYKJAIK', continent: 'EUROPE', status: 'enable' },
      { name: 'ISRAEL', capital: 'JERUSALEM', continent: 'ASIE', status: 'enable' },
      { name: 'ITALIE', capital: 'ROME', continent: 'EUROPE', status: 'enable' },
      { name: 'JAMAIQUE', capital: 'KINGSTON', continent: 'AMERIQUE', status: 'enable' },
      { name: 'JAPON', capital: 'TOKYO', continent: 'ASIE', status: 'enable' },
      { name: 'JORDANIE', capital: 'AMMAN', continent: 'ASIE', status: 'enable' },
      { name: 'KAZAKHSTAN', capital: 'ASTANA', continent: 'ASIE', status: 'enable' },
      { name: 'KENYA', capital: 'NAIROBI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'KIRGHIZISTAN', capital: 'BICHKEK', continent: 'ASIE', status: 'enable' },
      { name: 'KIRIBATI', capital: 'TARAWA', continent: 'OCEANIE', status: 'enable' },
      { name: 'KOSOVO', capital: 'PRISTINA', continent: 'EUROPE', status: 'enable' },
      { name: 'KOWEIT', capital: 'KOWEIT', continent: 'ASIE', status: 'enable' },
      { name: 'LAOS', capital: 'VIENTIANE', continent: 'ASIE', status: 'enable' },
      { name: 'LESOTHO', capital: 'MASERU', continent: 'AFRIQUE', status: 'enable' },
      { name: 'LETTONIE', capital: 'RIGA', continent: 'EUROPE', status: 'enable' },
      { name: 'LIBAN', capital: 'BEYROUTH', continent: 'ASIE', status: 'enable' },
      { name: 'LIBERIA', capital: 'MONROVIA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'LIBYE', capital: 'TRIPOLI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'LIECHTENSTEIN', capital: 'VADUZ', continent: 'EUROPE', status: 'enable' },
      { name: 'LITUANIE', capital: 'VILNIUS', continent: 'EUROPE', status: 'enable' },
      { name: 'LUXEMBOURG', capital: 'LUXEMBOURG', continent: 'EUROPE', status: 'enable' },
      { name: 'MACEDOINE', capital: 'SKOPJE', continent: 'EUROPE', status: 'enable' },
      { name: 'MADAGASCAR', capital: 'ANTANANARIVO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'MALAISIE', capital: 'KUALA LUMPUR', continent: 'ASIE', status: 'enable' },
      { name: 'MALAWI', capital: 'LILONGWE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'MALDIVES', capital: 'MALE', continent: 'ASIE', status: 'enable' },
      { name: 'MALI', capital: 'BAMAKO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'MALTE', capital: 'LA VALETTE', continent: 'EUROPE', status: 'enable' },
      { name: 'MAROC', capital: 'RABAT', continent: 'AFRIQUE', status: 'enable' },
      { name: 'MARSHALL', capital: 'MAJURO', continent: 'OCEANIE', status: 'enable' },
      { name: 'MAURITANIE', capital: 'NOUAKCHOTT', continent: 'AFRIQUE', status: 'enable' },
      { name: 'MEXIQUE', capital: 'MEXICO', continent: 'AMERIQUE', status: 'enable' },
      { name: 'MICRONESIE', capital: 'PALIKIR', continent: 'OCEANIE', status: 'enable' },
      { name: 'MOLDAVIE', capital: 'CHISINAU', continent: 'EUROPE', status: 'enable' },
      { name: 'MONACO', capital: 'MONACO', continent: 'EUROPE', status: 'enable' },
      { name: 'MONGOLIE', capital: 'OULAN-BATOR', continent: 'ASIE', status: 'enable' },
      { name: 'MONTENEGRO', capital: 'PODGORICA', continent: 'EUROPE', status: 'enable' },
      { name: 'MOZAMBIQUE', capital: 'MAPUTO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'NAMIBIE', capital: 'WINDHOEK', continent: 'AFRIQUE', status: 'enable' },
      { name: 'NAURU', capital: 'YAREN', continent: 'OCEANIE', status: 'enable' },
      { name: 'NEPAL', capital: 'KATMANDOU', continent: 'ASIE', status: 'enable' },
      { name: 'NICARAGUA', capital: 'MANAGUA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'NIGER', capital: 'NIAMEY', continent: 'AFRIQUE', status: 'enable' },
      { name: 'NIGERIA', capital: 'ABUJA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'NORVEGE', capital: 'OSLO', continent: 'EUROPE', status: 'enable' },
      { name: 'NOUVELLE-ZELANDE', capital: 'WELLINGTON', continent: 'OCEANIE', status: 'enable' },
      { name: 'OMAN', capital: 'MASCATE', continent: 'ASIE', status: 'enable' },
      { name: 'OUGANDA', capital: 'KAMPALA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'OUZBEKISTAN', capital: 'TACHKENT', continent: 'ASIE', status: 'enable' },
      { name: 'PAKISTAN', capital: 'ISLAMABAD', continent: 'ASIE', status: 'enable' },
      { name: 'PALAOS', capital: 'MELEKEOK', continent: 'OCEANIE', status: 'enable' },
      { name: 'PANAMA', capital: 'PANAMA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'PAPOUASIE-NOUVELLE-GUINEE', capital: 'PORT MORESBY', continent: 'OCEANIE', status: 'enable' },
      { name: 'PARAGUAY', capital: 'ASUNCION', continent: 'AMERIQUE', status: 'enable' },
      { name: 'PAYS DE GALLES', capital: 'CARDIFF', continent: 'EUROPE', status: 'enable' },
      { name: 'PAYS-BAS', capital: 'AMSTERDAM', continent: 'EUROPE', status: 'enable' },
      { name: 'PEROU', capital: 'LIMA', continent: 'AMERIQUE', status: 'enable' },
      { name: 'PHILIPPINES', capital: 'MANILLE', continent: 'ASIE', status: 'enable' },
      { name: 'POLOGNE', capital: 'VARSOVIE', continent: 'EUROPE', status: 'enable' },
      { name: 'PORTUGAL', capital: 'LISBONNE', continent: 'EUROPE', status: 'enable' },
      { name: 'QATAR', capital: 'DOHA', continent: 'ASIE', status: 'enable' },
      { name: 'REPUBLIQUE CENTRAFRICAINE', capital: 'BANGUI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'REPUBLIQUE DEMOCRATIQUE DU CONGO', capital: 'KINSHASA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'REPUBLIQUE DOMINICAINE', capital: 'SAINT-DOMINGUE', continent: 'AMERIQUE', status: 'enable' },
      { name: 'REPUBLIQUE TCHEQUE', capital: 'PRAGUE', continent: 'EUROPE', status: 'enable' },
      { name: 'ROUMANIE', capital: 'BUCAREST', continent: 'EUROPE', status: 'enable' },
      { name: 'RUSSIE', capital: 'MOSCOU', continent: 'EUROPE', status: 'enable' },
      { name: 'RWANDA', capital: 'KIGALI', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SAINTE-LUCIE', capital: 'CASTRIES', continent: 'AMERIQUE', status: 'enable' },
      { name: 'SAINT-KITTS-ET-NEVIS', capital: 'BASSETERRE', continent: 'AMERIQUE', status: 'enable' },
      { name: 'SAINT-MARIN', capital: 'SAINT-MARIN', continent: 'EUROPE', status: 'enable' },
      { name: 'SAINT-VINCENT-ET-LES-GRENADINES', capital: 'KINGSTOWN', continent: 'AMERIQUE', status: 'enable' },
      { name: 'SALOMON', capital: 'HONIARA', continent: 'OCEANIE', status: 'enable' },
      { name: 'SALVADOR', capital: 'SAN SALVADOR', continent: 'AMERIQUE', status: 'enable' },
      { name: 'SAMOA', capital: 'APIA', continent: 'OCEANIE', status: 'enable' },
      { name: 'SAO TOME ET PRINCIPE', capital: 'SAO TOME', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SENEGAL', capital: 'DAKAR', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SERBIE', capital: 'BELGRADE', continent: 'EUROPE', status: 'enable' },
      { name: 'SEYCHELLES', capital: 'VICTORIA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SIERRA LEONE', capital: 'FREETOWN', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SINGAPOUR', capital: 'SINGAPOUR', continent: 'ASIE', status: 'enable' },
      { name: 'SLOVAQUIE', capital: 'BRATISLAVA', continent: 'EUROPE', status: 'enable' },
      { name: 'SLOVENIE', capital: 'LJUBLJANA', continent: 'EUROPE', status: 'enable' },
      { name: 'SOMALIE', capital: 'MOGADISCIO', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SOUDAN', capital: 'KHARTOUM', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SRI LANKA', capital: 'SRI JAYAWARDENAPURA', continent: 'ASIE', status: 'enable' },
      { name: 'SUEDE', capital: 'STOCKHOLM', continent: 'EUROPE', status: 'enable' },
      { name: 'SUISSE', capital: 'BERNE', continent: 'EUROPE', status: 'enable' },
      { name: 'SURINAME', capital: 'PARAMARIBO', continent: 'AMERIQUE', status: 'enable' },
      { name: 'SWAZILAND', capital: 'MBABANE', continent: 'AFRIQUE', status: 'enable' },
      { name: 'SYRIE', capital: 'DAMAS', continent: 'ASIE', status: 'enable' },
      { name: 'TADJIKISTAN', capital: 'DOUCHANBE', continent: 'ASIE', status: 'enable' },
      { name: 'TAIWAN', capital: 'TAIPEI', continent: 'ASIE', status: 'enable' },
      { name: 'TANZANIE', capital: 'DODOMA', continent: 'AFRIQUE', status: 'enable' },
      { name: "TCHAD", capital: "N'DJAMENA", continent: 'AFRIQUE', status: 'enable' },
      { name: 'THAILANDE', capital: 'BANGKOK', continent: 'ASIE', status: 'enable' },
      { name: 'TIMOR-ORIENTAL', capital: 'DILI', continent: 'OCEANIE', status: 'enable' },
      { name: 'TOGO', capital: 'LOME', continent: 'AFRIQUE', status: 'enable' },
      { name: 'TONGA', capital: 'NUKUALOFA', continent: 'OCEANIE', status: 'enable' },
      { name: 'TRINITE-ET-TOBAGO', capital: 'PORT OF SPAIN', continent: 'AMERIQUE', status: 'enable' },
      { name: 'TUNISIE', capital: 'TUNIS', continent: 'AFRIQUE', status: 'enable' },
      { name: 'TURKMENISTAN', capital: 'ACHGABAT', continent: 'ASIE', status: 'enable' },
      { name: 'TURQUIE', capital: 'ANKARA', continent: 'ASIE', status: 'enable' },
      { name: 'TUVALU', capital: 'FANAFUTI', continent: 'OCEANIE', status: 'enable' },
      { name: 'UKRAINE', capital: 'KIEV', continent: 'EUROPE', status: 'enable' },
      { name: 'URUGUAY', capital: 'MONTEVIDEO', continent: 'AMERIQUE', status: 'enable' },
      { name: 'VANUATU', capital: 'PORT-VILA', continent: 'OCEANIE', status: 'enable' },
      { name: 'VATICAN', capital: 'VATICAN', continent: 'EUROPE', status: 'enable' },
      { name: 'VENEZUELA', capital: 'CARACAS', continent: 'AMERIQUE', status: 'enable' },
      { name: 'VIET NAM', capital: 'HANOI', continent: 'ASIE', status: 'enable' },
      { name: 'YEMEN', capital: 'SANAA', continent: 'ASIE', status: 'enable' },
      { name: 'ZAMBIE', capital: 'LUSAKA', continent: 'AFRIQUE', status: 'enable' },
      { name: 'ZIMBABWE', capital: 'HARARE', continent: 'AFRIQUE', status: 'enable' },

      //{ name: '', capital: '', continent: '', status: 'enable' },

    ];

    // Filtrer pour insérer uniquement ceux qui n’existent pas encore
    const toInsert = paysList.filter(
      (p) => !existingNames.has(p.name.trim().toUpperCase())
    );

    if (toInsert.length === 0) {
      console.log('Aucun pays à insérer. La base est déjà à jour.');
      return;
    }

    // Insertion sécurisée, sans doublons
    await this.countryRepo.insert(toInsert);

    console.log(`${toInsert.length} nouveaux pays insérés.`);
  }


  async findAll(admin_uuid: string) {
    const counrty = await this.countryRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-findAll',
      admin.id,
      'recupération de la liste de tous les formations'
    );

    return counrty;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const check_country = await this.countryRepo.findOne({ where: { name: payload.name }});
    if(check_country){
        return check_country;
    }

    const newCountry = this.countryRepo.create({
      name: payload.name,
      captial:payload.captial ?? null,
      continent: payload.continent ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-store',
      admin.id,
      'Enregistrer une division'
    );

    const saved = await this.countryRepo.save(newCountry);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const country = await this.countryRepo.findOne({ where: { uuid } });

    if (!country) {
        throw new NotFoundException('Aucune pays trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-findOne',
      admin.id,
      'Recupérer un pays'
    );

    return country;
  }

  async findByUuid(uuid: string) {
    const country = await this.countryRepo.findOne({ where: { uuid } });

    return country;
  }

  async findOneByName(name: string) {
    const country = await this.countryRepo.findOne({ where: { name } });

    return country;
  }

  async update(uuid: string,payload: any,admin_uuid: string) {
    const { name, capital, continent } = payload;

    if (!uuid || !name || !admin_uuid) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }



    const existing = await this.countryRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;
    existing.captial= capital;
    existing.continent= continent;

    const updated = await this.countryRepo.save(existing);

    await this.logService.logAction(
      'countries-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const country = await this.countryRepo.findOne({ where: { uuid } });

    if (!country) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-delete',
      admin.id,
      "Suppression du pays "+country.name+" pour uuid"+country.uuid,
    );

   return await this.countryRepo.softRemove(country);

  }
}
