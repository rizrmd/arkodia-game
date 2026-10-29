/** Source-grounded v2 payloads. Unknown legacy fields are retained, never silently stripped. */
export type Extensible = { [key: string]: unknown };
export type UV = {u:number;v:number};
export type XY = {x:number;y:number};
export type Rect = [number,number,number,number];
export type Dependency = {id:string;kind:LegacyKind;revision:number};
export type Provenance = {repository:string;sourcePath:string;selector:string;sourceSha256:string;legacyId:string};
export type EnvironmentObject = {id:string;asset:string;u:number;v:number;count?:number;radius?:number;interval?:number} & Extensible;
export type EnvironmentMap = {schema:1;revision:number;name:string;objects:EnvironmentObject[]} & Extensible;
export type CollisionColumn = {x:number;w:number;back:number;front:number};
export type EnvironmentAsset = {id:string;label:string;file:string;width:number;height:number;pivot:[number,number];frame?:Rect;blocks:Rect[];layer:string;footprint:number;columns?:CollisionColumn[];components?:({file:string;width:number;foot:number;dx:number;dy:number;shear:number;vertical:number}&Extensible)[]} & Extensible;
export type EnvironmentCatalog = {version:1;occupied:Rect[];assets:EnvironmentAsset[]} & Extensible;
export type ReliefFeature = {id:string;type:'plateau'|'ramp'|'hill';u0:number;v0:number;u1:number;v1:number;heightM?:number;baseM?:number;topM?:number;ascend?:'-u'|'+u'|'-v'|'+v';outline?:[number,number][];connectsTo?:string;rampStartU?:number;rampStartV?:number;visual?:'scenery'} & Extensible;
export type WorldMap = {id:string;version:1;name:string;sizeTiles:number;metersPerTile:number;chunkTiles:number;seed:string;prefabs:{prefab:string;at:UV}[];terrain?:{pxPerMeter:number;maxStepM:number;features:ReliefFeature[]}} & Extensible;
export type Frontier = {id:string;version:1;map:string;terrain:ReliefFeature[];kit:Record<string,Extensible>;placements:({a:string;u:number;v:number;s?:number;lift?:number}&Extensible)[]} & Extensible;
export type PrefabBuilding = {x:number;y:number;legacy?:XY;width:number;pivot:number;asset:string;groundEdges:{rising:[[number,number],[number,number]];falling:[[number,number],[number,number]]}} & Extensible;
export type StrongholdPrefab = {
 id:'stronghold';version:1;anchor:UV;world:{width:number;height:number};court:{size:number;origin:XY;walkInset:number;openSnowFrom:number};
 gate:{x:number;threshold:XY;passageFromY:number;archHalfWidth:number;towerHalfSpan:number;towerFront:{knee:number;base:number;rise:number;peak:number;fall:number};towerDepth:number;columnStep:number;doors:{halfWidth:number;back:number;front:number};trigger:{y:number;closed:XY;open:XY};frontY:number;footprintHeight:{tower:number;doors:number};apron:Extensible;frames:number;passableAt:number};
 safeZone:{metersPerTile:number;center:UV;spawnDistanceM:number};heroSpawn:XY;buildings:Record<string,PrefabBuilding>;
 props:({group:string;id:string;u:number;v:number;width:number;foot?:number;shear?:number;vertical?:number;depth?:number;opacity?:number;assetSet?:'v1';layout?:'legacy'}&Extensible)[];
 lights:({u:number;v:number;lift:number;wall:boolean}&Extensible)[];
} & Extensible;
export type Clip = {fps:number;loop:boolean;frames:number[];impact?:number;strideScale?:number}&Extensible;
export type CharacterAtlas = {id:string;image:string;revision?:string;atlasSize:[number,number];scale:number;gutter:number;cell:{w:number;h:number;pivot:XY};direction:string;clips:Record<string,Clip>;frames:({row:number;col:number;x:number;y:number;w:number;h:number;source:Extensible}&Extensible)[]}&Extensible;
/** icon is a pixel cell size (128 in audited equipment), not an item index. */
export type EquipmentAtlas = {image:string;atlasSize:[number,number];icon:number;items:({id:string;x:number;y:number;w:number;h:number;source:Extensible}&Extensible)[]}&Extensible;
export type HeroGLB = {hero:string;name:string;glb:string;thumbnail:string;animations:({slug:'idle'|'run'|'idle_cast'|'run_cast'|'hit'|'death';label:string;loop:boolean}&Extensible)[]}&Extensible;
export type SpriteSheet = {title:string;source:string;columns:number;rows:number;frameCount?:number;fps:number;pivot:XY;loop?:boolean}&Extensible;
export type GLTF = {asset:{version:'2.0'}&Extensible;nodes:Extensible[];accessors:Extensible[];animations:({name:string;samplers:Extensible[];channels:Extensible[]}&Extensible)[]}&Extensible;
export type SkillCard = {name:string;description:string;kind:'active'|'passive';badge:string;icon:string;hero?:string;cooldownMs?:number}&Extensible;
/** Existing code constants and sampled outputs; does not replace executable targeting/combat. */
export type SkillCatalog = {cards:Record<string,SkillCard>;maxSlots:number;maxLearned:number;aoeRadiusTiles:number;rankSamples:Extensible[]}&Extensible;
export type EconomyRules = {balance:{hours:number;goldPerHour:number;manaPerHour:number;maxLevel:number;upgradeBase:number;start:Extensible}&Extensible;buildings:string[];startBuilt:string[];upgradeSamples:{building:string;level:number;cost:{gold:number;mana:number;souls:number}}[];defenseBranches:Record<string,Extensible>;defenseMinCore:number;defenseCost:Extensible;defenseCombat:Extensible}&Extensible;
export type CombatRules = {stats:Record<string,{hp:number;speed:number;reach:number;damage:number}>;cleave:number}&Extensible;
export type NixieEffect = {app:'vfx-editor';kind:'particle-effect';version:1;targetProfile:string;id:string;name:string;timeline:{frameRate:number;duration:number;loop:{enabled:boolean;start:number;end:number}}&Extensible;emitters:({id:string;name:string;enabled:boolean;maxParticles:number;spawn:Extensible;render:Extensible;modules:Extensible}&Extensible)[]}&Extensible;
export type CueLayer = {effect:string;at?:'origin'|'target';forward?:number;h?:number;aim?:boolean|'random';scale?:'radius'|number;delayMs?:number;follow?:boolean}&Extensible;
export type FXProfile = {id:string;extends?:string;cues:Record<string,CueLayer[]|{layers:CueLayer[];baseRadius?:number}>}&Extensible;
export type VisualPatch = {name?:string;source?:string;order?:number;deleted?:boolean;color?:string;opacity?:number;size?:number;count?:number;rate?:number;lifetime?:number;speed?:number;direction?:number;spread?:number;gravity?:number;x?:number;y?:number;z?:number;delay?:number;duration?:number;texture?:string;blend?:'alpha'|'additive'|'screen'|'multiply';columns?:number;rows?:number;fps?:number;frameCount?:number;pivotX?:number;pivotY?:number;loop?:boolean;enabled?:boolean}&Extensible;
export type VisualPatches = {version:1;revision:number;effects:Record<string,Record<string,VisualPatch>>}&Extensible;
export type AssetManifest = {entries:{path:string;sha256:string;size:number;mediaType:string}[]}&Extensible;
export type Payloads = {
 'arkadia.environment-map.v1':EnvironmentMap;
 'arkadia.environment-catalog.v1':EnvironmentCatalog;
 'arkadia.world-map.v1':WorldMap;
 'arkadia.frontier.v1':Frontier;
 'arkadia.stronghold-prefab.v1':StrongholdPrefab;
 'arkadia.character-atlas.v1':CharacterAtlas;
 'arkadia.equipment-atlas.v1':EquipmentAtlas;
 'arkadia.hero-glb.v1':HeroGLB;
 'arkadia.sprite-sheet.v1':SpriteSheet;
 'arkadia.gltf.v2':GLTF;
 'arkadia.skill-catalog.v1':SkillCatalog;
 'arkadia.economy-rules.v1':EconomyRules;
 'arkadia.combat-rules.v1':CombatRules;
 'arkadia.nixie-effect.v1':NixieEffect;
 'arkadia.fx-profile.v1':FXProfile;
 'arkadia.visual-patches.v1':VisualPatches;
 'arkadia.asset-manifest.v1':AssetManifest;
};
export type Format = keyof Payloads;
type Kinds = {
 'arkadia.environment-map.v1':'environment';'arkadia.environment-catalog.v1':'environment-catalog';'arkadia.world-map.v1':'environment';'arkadia.frontier.v1':'environment';
 'arkadia.stronghold-prefab.v1':'base';'arkadia.character-atlas.v1':'character';'arkadia.equipment-atlas.v1':'character';'arkadia.hero-glb.v1':'character';
 'arkadia.sprite-sheet.v1':'animation';'arkadia.gltf.v2':'animation';'arkadia.skill-catalog.v1':'skill';'arkadia.economy-rules.v1':'base';'arkadia.combat-rules.v1':'skill';
 'arkadia.nixie-effect.v1':'vfx';'arkadia.fx-profile.v1':'vfx';'arkadia.visual-patches.v1':'vfx';'arkadia.asset-manifest.v1':'asset-manifest';
};
export type LegacyKind = Kinds[Format];
export type LegacyDocument = {[F in Format]:{schemaVersion:2;kind:Kinds[F];name:string;assets:string[];dependencies:Dependency[];provenance:Provenance;data:{format:F;payload:Payloads[F];bindings:Record<string,string>}}}[Format];
