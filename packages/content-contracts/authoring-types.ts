/** v3 is editor authoring data; published game consumers must not load it. */
export type AuthoringDomain = 'objects' | 'environments' | 'bases' | 'characters' | 'animations' | 'audio' | 'vfx' | 'catalog';
export type AuthoringJSON = null | string | number | boolean | AuthoringJSON[] | {[key: string]: AuthoringJSON};
export type AuthoringEntity = {id: string; name: string; data: Record<string, AuthoringJSON>; assets: string[]; references: {domain: AuthoringDomain; id: string}[]};
export type AuthoringProjectDocument = {schemaVersion: 3; kind: 'authoring-project'; name: string; assets: string[]; data: {organizationId: string; projectId: string; domains: Record<AuthoringDomain, Record<string, AuthoringEntity>>}};
export type AuthoringOperation = {kind:'entity.put';domain:AuthoringDomain;id:string;label:string;entity:AuthoringEntity} | {kind:'entity.remove';domain:AuthoringDomain;id:string;label:string};
export type AuthoringActor = {userId:string;jobId?:string};
export type AuthoringTransaction = {revision:number;groupId:string;label:string;actor:AuthoringActor;action:'commit'|'validate'|'undo'|'redo';unit?:'group'|'operation';operations?:AuthoringOperation[]};
export type AuthoringHistory = {groups:{id:string;label:string;actor:AuthoringActor;operations:string[];applied:number}[];cursor:number;canUndo:boolean;canRedo:boolean};
