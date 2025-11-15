import { GlobalStatus } from "../enums/global-status.enum";

export interface MemberList {
    uuid: string,
    firstname: string;
    lastname: string;
    phone_number: string;
    formation: string | undefined;
    status: string,
    gohonzon: boolean
}