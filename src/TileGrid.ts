import { Color } from 'three';
import { ivec2, vec2, vec3, vec4, mat3, mat4, ProjectedRay, Box2f, RaycastHit } from './Math';
import { Globals } from './Globals';
import { Utils } from './Utils';
import { Atlas, Sprite25D, Door25D, FDef, SpriteFrame, Character, Direction4Way, SpriteTileInfo, CollisionHandling, HandGesture, SpriteAnimationData, SpriteKeyFrame, MonsterGrass25D } from './Main';
import { Int, roundToInt, toInt } from './Int';
import { MultiMap, HashSet, IVec2Set, IVec2Map, RandomSet } from './Base';
import world_data from './tiles_world.json';
import master_tileset from './decal_tileset.json';


class TmxProperty {
  public name: string;
  public type: string;
  public value: string;
}
class TmxTilesetTile {
  public id: Int;
  public properties: Array<TmxProperty>;
}
class TmxTileset {
  public columns: Int;
  public image: string;
  public imageheight: Int;
  public imagewidth: Int;
  public margin: Int;
  public name: string;
  public properties: Array<TmxProperty>;
  public spacing: Int;
  public tilecount: Int;
  public tiledversion: string;
  public tileheight: Int;
  public tiles: Array<TmxTilesetTile>;
  public tilewidth: Int;
  public type: string;
  public version: number;
}
class TmxMapTileset {
  //Tileset in Tiled.
  public columns: Int;//":6,
  public firstgid: Int;//":1,
  public image: Int; //"..\/..: Int;//\/miner\/Core\/Content\/mintiles-16x16.png",
  public imageheight: Int;//":512,
  public imagewidth: Int;//":103,
  public margin: Int;//":1,
  public name: Int;//:"WorldTiles",
  public spacing: Int;//":1,
  public tilecount: Int;//":180,
  public tileheight: Int;//":16,
  public tilewidth: Int;//":16
}
class TmxLayer {
  //Layer in Tiled
  public data: Array<Int>;
  public height: Int;//":44,
  public id: Int;//":6,
  public name: string;//":"Border",
  public opacity: number;//":1,
  public type: string;//":"tilelayer",
  public visible: boolean;//":true,
  public width: Int;//":60,
  public x: Int;//":0,
  public y: Int;//":0
  public objects: Array<TmxObject>;
  public draworder: string;
}
class TmxObject {
  public name: string;
  public gid: Int; // This is the tile index. Id is not the tile index.
  public properties: Array<TmxProperty>;
  public rotation: number;
  public visible: boolean;
  public x: Int;
  public y: Int;
  public width: Int;
  public height: Int;
}
class TmxMap {
  //This is a map in Tiled
  public width: Int; //":60    
  public height: Int;
  public infinite: boolean;
  public nextlayerid: Int;//":9,
  public nextobjectid: Int;//":1,
  public orientation: string;//":"orthogonal",
  public renderorder: string; //":"right-down",
  public tiledversion: string;//":"1.2.0",
  public tilewidth: Int; //":16,
  public tileheight: Int;//":16,
  public type: string; //":"map",
  public version: string; //":1.2,\
  public layers: Array<TmxLayer>;
  public tilesets: Array<TmxMapTileset>;///":
}

class TiledUtils {
  public static propMatch(name: string, p: TmxProperty): boolean {
    if (p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
      return true;
    }
    return false;
  }
  public static validateProp(x: any) {
    if (x === null || x === undefined) {
      //value was null or undefined -e rrro
      Globals.logError("Error parsing tile definition")
      Globals.debugBreak();
    }

  }
}

export type TiledTileId = Int;
export type HelixTileId = Int;

export enum HelixTileType {
  //This is different from old tiledspriteid because this is determines the class/function of the sprite not just its tileset.
  Unset,
  Character,
  PortalTrigger,
  BorderBlocker,
  Conduit,
  CellTile,
  UI,
  Object
}
export enum TileLayerId {
  /* THESE MUST BE IN ORDER TO GET CELL BLOCKS ARRAY */

  Border = 0,
  Background = 1,
  Elevation = 2,
  Water = 3, //Midground = 2,
  AboveWater = 4,
  Objects = 5,
  Objects2 = 6,
  Foreground = 7,
  Conduit = 8,
  Data_Objects = 9,
  LayerCountEnum = 10,

  Player_Relative_Foreground = 90, // Goes in front of player if player is on tile, or behind player if player is in front.
  DebugBackground = 91,
  Unset = 999, // Special layer type indicating that the layer of this
}
export enum Tiling {
  None,
  //Set3x3Block /*a solid 3x3 block with no corners (9 tiles) */,
  //Set3x3Seamless /* a terrain master tileset 40+ tiles */,
  RandomSprite, // Sprite is in a random set of sprites, of which we select a random frame
  RandomFrame, //Sprite is not a member of a random set, Just select a random frame from this sprite itself.
  FoliageTiling,
  FenceRules,
  HardBorderRules,
  DockRules,
}
export enum CollisionBits {
  Top = 0x01,
  Right = 0x02,
  Bot = 0x04,
  Left = 0x08
}

export class SpriteFrameDefinition {
  public tiled_id: TiledTileId = toInt(-1);

  //FromTILED
  public after_load: string = null;
  public animation: Array<Array<number>> = null;
  public typescript_class: string = null;
  public collision: CollisionHandling = null;
  public collision_bits: Int = null; //CollisionBits enum
  public default_character_animation: boolean = null;
  public frame_index: Int = null;
  public gesture: HandGesture = null;
  public is_key: boolean = false;
  public is_player: boolean = false;
  public layer: TileLayerId = TileLayerId.Unset;  //o
  public duration: number = null;
  public name: string = "";
  public tiling: Tiling = null;
  public random_prob_element: number = null;
  public tiles_width: number = null;
  public tiles_height: number = null;

  public static readonly prop_after_load: string = "after_load";//  - function to run (compiled javascript) after loading
  public static readonly prop_animation: string = "animation";// - the tile animation.
  public static readonly prop_class: string = "class";//  - character and treasrue chest subclasses of Phy25, otherwise, the class iks Sprite25D
  public static readonly prop_collision: string = "collision";//  - none, layer (collide with layer objects)
  public static readonly prop_collision_bits: string = "collision_bits";//- the borders of this tile that can be collided, in TOP, RIGHT, BOTTOM, LEFT order, ex: to collide top and left: 1001.  Default value is : 1111 for all collided sprites.
  public static readonly prop_default_character_animation: string = "default_character_animation";//- Whether to specify that this character is using default animation.
  public static readonly prop_frame_index: string = "frame_index"; // If set, this is the index of the frame, if unset, the index is row major
  public static readonly prop_gesture: string = "gesture";//   - hand gesture for grabber
  public static readonly prop_is_key: string = "is_key";//  - only one per sprite.  this sprite has the key default attributes for all other sprites
  public static readonly prop_is_player: string = "is_player";//  - if this sprite is the player sprite
  public static readonly prop_layer: string = "layer";// - if layer is specified then the tile is placed on that layer, otherwise the tile is placed on the layer that it was read in as.
  public static readonly prop_duration: string = "duration";//    - frame duration for the default tile animation
  public static readonly prop_name: string = "name";//- name
  public static readonly prop_tiling: string = "tiling";//  - none (tile is decal), random, fence, dock, white_border
  public static readonly prop_random_prob_element: string = "random_prob_element";//               - the probability of this tile in the tiling is random
  public static readonly prop_tiles_width: string = "tiles_width";//      - the sets of random tiles that this is included with.
  public static readonly prop_tiles_height: string = "tiles_height";//      - the sets of random tiles that this is included with.


  public static parse(tiled_tileset_id: Int, props: Array<TmxProperty>): SpriteFrameDefinition {
    let ret: SpriteFrameDefinition = new SpriteFrameDefinition();
    ret.tiled_id = tiled_tileset_id;

    let debug_name = "";
    //Parse name first so we have some way to breakpoint this
    for (let prop of props) {
      if (TiledUtils.propMatch(SpriteFrameDefinition.prop_name, prop)) {
        TiledUtils.validateProp(ret.name = prop.value);
        debug_name = ret.name;
      }
    }

    //Parse all props
    for (let prop of props) {
      if (TiledUtils.propMatch(SpriteFrameDefinition.prop_after_load, prop)) {
        TiledUtils.validateProp(ret.after_load = prop.value);
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_animation, prop)) {
        TiledUtils.validateProp(ret.animation = JSON.parse(JSON.stringify(prop.value)));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_class, prop)) {
        TiledUtils.validateProp(ret.typescript_class = prop.value);
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_collision, prop)) {
        TiledUtils.validateProp(ret.collision = Utils.stringToEnum(prop.value, Object.keys(CollisionHandling)) as CollisionHandling);
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_collision_bits, prop)) {
        if (prop.value.length === 4) {
          let top: boolean = prop.value.substr(0, 1) === "1";
          let right: boolean = prop.value.substr(1, 1) === "1";
          let bot: boolean = prop.value.substr(2, 1) === "1";
          let left: boolean = prop.value.substr(3, 1) === "1";

          ret.collision_bits = toInt((top ? CollisionBits.Top : 0) | (right ? CollisionBits.Right : 0) | (bot ? CollisionBits.Bot : 0) | (left ? CollisionBits.Left : 0));
        }
        else {
          Globals.logError("parsing " + this.name + ": Collision bits string must be 4 numbers long.")
          Globals.debugBreak();
        }
      }

      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_default_character_animation, prop)) {
        TiledUtils.validateProp(ret.default_character_animation = Utils.parseBool(prop.value));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_frame_index, prop)) {
        TiledUtils.validateProp(ret.frame_index = Utils.parseInt(prop.value))
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_gesture, prop)) {
        TiledUtils.validateProp(ret.gesture = Utils.stringToEnum(prop.value, Object.keys(HandGesture)) as HandGesture);
      }

      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_is_key, prop)) {
        TiledUtils.validateProp(ret.is_key = Utils.parseBool(prop.value));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_is_player, prop)) {
        TiledUtils.validateProp(ret.is_player = Utils.parseBool(prop.value));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_layer, prop)) {
        TiledUtils.validateProp(ret.layer = Utils.stringToEnum(prop.value, Object.keys(TileLayerId)) as TileLayerId);
        if (ret.layer === TileLayerId.Player_Relative_Foreground) {
          let nnn = 0;
          nnn++;
        }
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_tiling, prop)) {
        TiledUtils.validateProp(ret.tiling = Utils.stringToEnum(prop.value, Object.keys(Tiling)) as Tiling);
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_random_prob_element, prop)) {
        TiledUtils.validateProp(ret.random_prob_element = Utils.parseNumber(prop.value));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_tiles_height, prop)) {
        TiledUtils.validateProp(ret.tiles_height = Utils.parseNumber(prop.value));
      }
      else if (TiledUtils.propMatch(SpriteFrameDefinition.prop_tiles_width, prop)) {
        TiledUtils.validateProp(ret.tiles_width = Utils.parseNumber(prop.value));
      }


    }
    return ret;
  }
}
export class SpriteDefs {
  //This is the definitions for all tiles in the game.
  //If we get Monogame Toolkit to work... we can eventually do away with this.
  private _sprites: Map<HelixTileId, Sprite25D> = new Map<HelixTileId, Sprite25D>();
  private _defs: Array<SpriteFrameDefinition> = new Array<SpriteFrameDefinition>();
  private _spriteLUT: Map<TiledTileId, HelixTileId>; // Lookup table to convert TMX tileset ID into a Sprite ID the engine can use.
  private _frameLUT: Map<HelixTileId, Int>; // Lookup table to convert the helix ID of a tile to the keyframe offset.

  private _borderTileId: HelixTileId = MasterMap.UNDEFINED_TILE;
  private _playerTileId: HelixTileId = MasterMap.UNDEFINED_TILE;
  private _portalTileId: HelixTileId = MasterMap.UNDEFINED_TILE; // Note: there may be multiple types of doors. but we can just use a single trigger for this
  private _conduitTileId: HelixTileId = MasterMap.UNDEFINED_TILE;

  public get BorderTileId(): HelixTileId { return this._borderTileId; }
  public get PlayerTileId(): HelixTileId { return this._playerTileId; }
  public get DoorTileId(): HelixTileId { return this._portalTileId; }
  public get ConduitTileId(): HelixTileId { return this._conduitTileId; }
  public SpriteSets: Array<RandomSet<Sprite25D>> = new Array<RandomSet<Sprite25D>>();
  public FrameSets: Map<Sprite25D, RandomSet<SpriteKeyFrame>> = new Map<Sprite25D, RandomSet<SpriteKeyFrame>>();

  public static readonly prop_random_sprite_sets: string = "random_sprite_sets";//      - the sets of random tiles that this is included with.

  private _random_set_string: string = null;

  public constructor(atlas: Atlas, tileset: TmxTileset) {
    this.parseMapProperties(tileset);
    this.parseTileDefs(atlas, tileset);
    this.assembleSprites(atlas);
  }
  public update(dt: number) {
    //Update the animations of the static tiles.
    for (let [k, v] of this._sprites) {
      if (v.TilingAnimated) {
        v.update(dt);
      }
    }
  }
  public getPlayerTile(): Character {
    let ret: Character = null;
    for (let [k, v] of this._sprites) {
      if (v instanceof Character) {
        if ((v as Character).IsPlayer) {
          ret = v;
          break;
        }
      }
    }
    return ret;
  }
  public getTile(id: HelixTileId) {
    let ret = this._sprites.get(id);
    return ret || null;
  }
  public getTileFrameIndex(tiled_id: TiledTileId, helix_id: HelixTileId): Int {
    //Map the tiled frame to the keyframe offset in our helix sprite.
    //returns 0 as default
    let ret: Int = toInt(0);
    ret = this._frameLUT.get(tiled_id);
    if (!ret) {
      return toInt(0);
    }
    return ret;
  }
  public tiledIdtoHelixId(id: Int): Int {
    //Convert the ACTUAL tiled ID to helix.  The Tiled Id is +1 when exported so it should be subtracted before this function.
    //Also, when we convert this, we convert arrays of frames.  By convention you can use any frame in TILED to define the map, but
    //we aggregate them to sprite animations here.
    //New function - this maps a SET of tiled sprites to a Helix sprite object.
    let idr = this._spriteLUT.get(id);
    if (!idr) {
      return null;
    }
    return toInt(idr);
  }
  public debug_printLUT() {
    let s: string = "";
    for (let [k, v] of this._spriteLUT) {
      s += "[" + k + "," + v + "]";
    }
    Globals.logDebug(s);
  }
  public getSpriteByName(name: string): Sprite25D {
    let found: Sprite25D = null;
    //now find the sprite by name
    //Try to find sprite, if not found make a new one.
    for (let [k, v] of this._sprites) {
      let s1 = Utils.copyString(v.Name).trim();
      let s2 = Utils.copyString(name).trim();
      if (s1 === s2) {
        found = v;
        break;
      }
    }
    return found;
  }
  public getFrameRandomSet(sp: Sprite25D): RandomSet<SpriteKeyFrame> {
    let ret = this.FrameSets.get(sp);
    if (!ret) {
      ret = null;
    }
    return ret;
  }
  public getSpriteRandomSet(sp: Sprite25D): RandomSet<Sprite25D> {
    for (let ss of this.SpriteSets) {
      for (let [p, s] of ss.Elements) {
        if (s === sp) {
          return ss;
        }
      }
    }
    return null;
  }


  private parseMapProperties(tileset: TmxTileset) {
    for (let prop of tileset.properties) {
      //Parse the random sets.
      if (TiledUtils.propMatch(SpriteDefs.prop_random_sprite_sets, prop)) {
        TiledUtils.validateProp(this._random_set_string = prop.value);
      }
    }
  }
  private _max_frame_id = -9999;
  private parseTileDefs(atlas: Atlas, tileset: TmxTileset) {
    //parses the tileset into frame definitions to be assembled into sprites
    try {
      let debug_info: string = "";
      this._defs = new Array<SpriteFrameDefinition>();

      if (tileset.tiles) {
        for (let tile of tileset.tiles) {
          let tiled_tileset_id = tile.id;
          if (this._max_frame_id < tile.id) {
            this._max_frame_id = tile.id;
          }

          if (tile.properties) {
            let frameData = SpriteFrameDefinition.parse(tiled_tileset_id, tile.properties);
            this._defs.push(frameData);
          }
          else {
            Globals.logWarn("Tile id '" + tiled_tileset_id + " " + "' did not have a 'name' property at least.  This is required.  Tile will not be used!");
            debug_info += "Error! = " + tiled_tileset_id + " " + "\r\n";
          }

        }
      }
      else {
        Globals.logError("Tileset tiles were undefined.");
      }
      Globals.logDebug("Parsed tileset tiles:\r\n" + debug_info);

    }
    catch (ex) {
      Globals.logError(ex);
      Globals.debugBreak();
    }
  }
  private assembleSprites(atlas: Atlas) {
    this._spriteLUT = new Map<TiledTileId, HelixTileId>();
    this._frameLUT = new Map<TiledTileId, Int>();
    this._sprites = new Map<HelixTileId, Sprite25D>();

    let nSpritesCreated = 0;
    //First create all key sprites so we have our sprite created. if there are no key sprites just make the default the top-left most 
    for (let def of this._defs) {
      let key = this.getKeySpriteFrameDef(def.name, true);
      if (!this.getSpriteByName(def.name)) {
        //Create new key 
        let spr: Sprite25D = this.makeNewSprite(atlas, def);
        this._sprites.set(spr.HelixTileId, spr);

        nSpritesCreated++;
      }
    }

    let frameerror: string = "";
    let nFramesAdded = 0;
    //Now loop over all additional frames and add them to the sprite.
    for (let frameDef of this._defs) {
      this.validateNoDupes(frameDef);

      let keySprite: Sprite25D = this.getSpriteByName(frameDef.name);
      if (!keySprite) {
        frameerror += "Could not find sprite definition for '" + frameDef.name + "'.  This should be present already.\r\n";
      }
      else {
        //So it doesn't matter, we'll add sprite frames to *default* for all sprites, even characters. We just add extra animations for char sprites.
        this.addSpriteFrame(atlas, frameDef, keySprite);
        nFramesAdded++;
      }
    }

    if (frameerror.length) {
      Globals.logError(frameerror);
    }

    this.parseRandomSets();

    //run all callbacks after sprites are loaded.
    for (let [k, v] of this._sprites) {
      if (v.AfterLoadCallback) {
        v.AfterLoadCallback(v);
      }
    }

  }
  private makeCharacterSprite(atlas: Atlas, def: SpriteFrameDefinition): Character {
    let ret = new Character(atlas);
    ret.Name = def.name;
    ret.HelixTileId = this.genHelixSpriteId();
    ret.Layer = def.layer;
    if (def.is_player) {
      (ret as Character).IsPlayer = true;
      if (this._playerTileId !== MasterMap.UNDEFINED_TILE) {
        Globals.logError("Multiple is_player were defined.  This is an error. only one tile can be set is_player and it must be the sprite's key tile");
        Globals.debugBreak();
      }
      else {
        this._playerTileId = ret.HelixTileId;
      }
    }

    //Apply character animation.
    if (!def.default_character_animation || def.default_character_animation === true) {
      // let ret: Array<Array<Array<number>>> = JSON.parse(JSON.stringify(def.animation));
      if (ret) {
        this.addCharacterAnimation(ret as Character, atlas,
          [[3, 1], [4, 1], [3, 1], [5, 1]],
          [[3, 1], [4, 1], [3, 1], [5, 1]],
          [[6, 1], [7, 1], [6, 1], [8, 1]],
          [[0, 1], [1, 1], [0, 1], [2, 1]]
        );
      }
      else {
        Globals.logError("Sprite animation was not defined correctly.");
      }
    }
    else {
      Globals.logError("Unsupported animation without char");
    }
    return ret;
  }
  private makeTileSprite(atlas: Atlas, def: SpriteFrameDefinition): Sprite25D {
    let ret = new Sprite25D(atlas);
    ret.Name = def.name;
    ret.HelixTileId = this.genHelixSpriteId();
    ret.Layer = def.layer;
    ret.TileType = HelixTileType.CellTile;//e.g. class = "Tile"  we don't have a specific "tile" sprite, so this variable servest hat purpose, but we could have e.g. Character, Tile, Chest..
    return ret;
  }
  private makeDoorSprite(atlas: Atlas, def: SpriteFrameDefinition): Door25D {
    let ret = new Door25D(atlas);
    ret.Name = def.name;
    ret.HelixTileId = this.genHelixSpriteId();
    ret.Layer = def.layer;
    ret.TileType = HelixTileType.CellTile;//e.g. class = "Tile"  we don't have a specific "tile" sprite, so this variable servest hat purpose, but we could have e.g. Character, Tile, Chest..
    return ret;
  }
  private makeMonsterGrassSprite(atlas: Atlas, def: SpriteFrameDefinition): MonsterGrass25D {
    let ret = new MonsterGrass25D(atlas);
    ret.Name = def.name;
    ret.HelixTileId = this.genHelixSpriteId();
    ret.Layer = def.layer;
    ret.TileType = HelixTileType.CellTile;//e.g. class = "Tile"  we don't have a specific "tile" sprite, so this variable servest hat purpose, but we could have e.g. Character, Tile, Chest..
    return ret;
  }
  private makeUISprite(atlas: Atlas, def: SpriteFrameDefinition): Sprite25D {
    let ret = new Sprite25D(atlas);
    ret.Name = def.name;
    ret.HelixTileId = this.genHelixSpriteId();
    ret.Layer = def.layer;
    ret.TileType = HelixTileType.UI;//e.g. class = "Tile"  we don't have a specific "tile" sprite, so this variable servest hat purpose, but we could have e.g. Character, Tile, Chest..
    return ret;
  }
  private makeNewSprite(atlas: Atlas, def: SpriteFrameDefinition): Sprite25D {
    //Create a new sprite based on the class, or a default tile if no class was defined
    let ret: Sprite25D = null;

    this.validateNoDupes(def);

    if (def.typescript_class) {
      if (Utils.lcmp(def.typescript_class, "Character")) {
        ret = this.makeCharacterSprite(atlas, def);
      }
      else if (Utils.lcmp(def.typescript_class, "Tile")) {
        ret = this.makeTileSprite(atlas, def);
      }
      else if (Utils.lcmp(def.typescript_class, "Door")) {
        ret = this.makeDoorSprite(atlas, def);
      }
      else if (Utils.lcmp(def.typescript_class, "PortalTrigger")) {
        ret = this.makeTileSprite(atlas, def);

        ret.TileType = HelixTileType.PortalTrigger;
        if (this._portalTileId !== MasterMap.UNDEFINED_TILE) {
          Globals.logError("Multiple door class were defined.  This is an error. only one tile can be set door class and it must be the sprite's key tile");
          Globals.debugBreak();
        }
        else {
          this._portalTileId = ret.HelixTileId;
        }
      }
      else if (Utils.lcmp(def.typescript_class, "AreaBoundary")) {
        ret = this.makeTileSprite(atlas, def);

        ret.TileType = HelixTileType.BorderBlocker;
        if (this._borderTileId !== MasterMap.UNDEFINED_TILE) {
          Globals.logError("Multiple border class tiles were defined.  This is an error. only one tile can be set border class and it must be the sprite's key tile");
          Globals.debugBreak();
        }
        else {
          this._borderTileId = ret.HelixTileId;
        }
      }
      else if (Utils.lcmp(def.typescript_class, "Conduit")) {
        ret = this.makeTileSprite(atlas, def);

        ret.TileType = HelixTileType.Conduit;
        if (this._conduitTileId !== MasterMap.UNDEFINED_TILE) {
          Globals.logError("Multiple conduit class tiles were defined.  This is an error. only one tile can be set conduit class and it must be the sprite's key tile");
          Globals.debugBreak();
        }
        else {
          this._conduitTileId = ret.HelixTileId;
        }
      }
      else if (Utils.lcmp(def.typescript_class, "UI")) {
        ret = this.makeUISprite(atlas, def);
      }
      else if (Utils.lcmp(def.typescript_class, "MonsterGrass")) {
        ret = this.makeMonsterGrassSprite(atlas, def);
      }
      else {
        //TODO:
        Globals.logError("Could not make sprite for class " + def.typescript_class);
      }
    }


    //If we didn't have a class or couldn't find one, then instantiate as basic tile.
    if (ret === null) {
      Globals.logWarn("Sprite class not created, defaulting to Tile for def: " + def.name)
      ret = this.makeTileSprite(atlas, def);
      //Globals.debugBreak();
    }

    if (def.collision) {
      ret.CollisionHandling = def.collision;
    }
    if (def.collision_bits) {
      ret.CollisionBits = def.collision_bits;
    }
    if (def.tiling) {
      ret.Tiling = def.tiling;
    }
    else {
      ret.Tiling = Tiling.None;
    }


    return ret;
  }
  private parseRandomSets() {
    let errors = "";
    if (this._random_set_string) {
      if (Utils.isValidJson(this._random_set_string)) {
        let vals: Array<Map<string, number>> = JSON.parse(this._random_set_string);
        if (vals) {
          for (let v_set of vals) {
            let rs = new RandomSet<Sprite25D>();
            this.SpriteSets.push(rs);

            for (let [k, v] of v_set) {
              let sp: Sprite25D = this.getSpriteByName(k);
              if (!sp) {
                errors += " sprite '" + k + "'could not be found when creating random set\r\n.";
              }
              else {
                rs.set(sp, v);
              }
            }

          }
        }
        else {
          errors += "Could not parse valid Map<k,v> json : '" + this._random_set_string + "'";
        }
      }
      else {
        errors += "Random set json was not valid : '" + this._random_set_string + "'";
      }
    }

    //Normalize sets.
    for (let [k, v] of this._sprites) {
      let rs = this.getSpriteRandomSet(v);//redundant..meh
      let frs = this.getFrameRandomSet(v);
      if (frs) {
        frs.normalize();
      }
      if (rs) {
        frs.normalize();
      }
    }

    if (errors) {
      Globals.logError(errors);
    }
  }
  private addSpriteFrame(atlas: Atlas, frameDef: SpriteFrameDefinition, sprite: Sprite25D) {
    if (frameDef.after_load) {
      if (sprite.AfterLoadCallback !== null) {
        Globals.logWarn(sprite.Name + ": After load was already defined. ")
      }
      else {
        sprite.AfterLoadCallback = function (sprite: Sprite25D) {
          try {
            new Function("sprite", frameDef.after_load).call(this, sprite);
            //window.eval.call(window, '(function (element) {' + frameDef.after_load + '})')(sprite);
          }
          catch (ex) {
            Globals.logError("Eval failed on sprite " + sprite.Name + ": \r\n" + frameDef.after_load + "\r\n\r\nException:\r\n" + ex ? ex : '');
          }
        }
      }
    }

    // let frame_index = null;
    // if (frameDef.frame_index) {
    //   frame_index = frameDef.frame_index;
    // }

    let frame_w = 1;
    if (frameDef.tiles_width) {
      frame_w = frameDef.tiles_width;
    }
    let frame_h = 1;
    if (frameDef.tiles_height) {
      frame_h = frameDef.tiles_height;
    }

    let tuple = atlas.tiledFrameIdToTuple(frameDef.tiled_id);

    let fr: SpriteKeyFrame = sprite.Animation.addTileFrame(tuple, atlas, new ivec2(1, 1), [], frameDef.duration, new ivec2(frame_w, frame_h));

    //Set the random frame if it is set.
    if (frameDef.random_prob_element) {
      let rs: RandomSet<SpriteKeyFrame> = this.getFrameRandomSet(sprite);
      if (rs === null) {
        rs = new RandomSet<SpriteKeyFrame>();
        this.FrameSets.set(sprite, rs);
      }
      rs.set(fr, frameDef.random_prob_element, false);
    }

    //Set the LUT to quickly convert from the tiled index to the Helix index.
    this.addToLUT(frameDef.tiled_id, sprite.HelixTileId, toInt(sprite.Animation.TileData.KeyFrames.length - 1));
  }

  private addCharacterAnimation(char: Character, atlas: Atlas, left: any, right: any, up: any, down: any) {

    //This places the char's head above things in the world, and also makes it not collidable.
    let props = [
      new SpriteTileInfo(new ivec2(0, 0), TileLayerId.Foreground, CollisionHandling.None),
      new SpriteTileInfo(new ivec2(0, 1), TileLayerId.Objects, CollisionHandling.Layer)
    ]

    char.Animation.addTiledAnimation(Character.getAnimationNameForMovementDirection(Direction4Way.Down),
      FDef.default(down),
      0.7, atlas,
      new ivec2(1, 2), true, props);
    char.Animation.addTiledAnimation(Character.getAnimationNameForMovementDirection(Direction4Way.Right),
      FDef.default(right),
      0.7, atlas,
      new ivec2(1, 2), true, props);
    char.Animation.addTiledAnimation(Character.getAnimationNameForMovementDirection(Direction4Way.Left),
      FDef.default(left, true),
      0.7, atlas,
      new ivec2(1, 2), true, props);
    char.Animation.addTiledAnimation(Character.getAnimationNameForMovementDirection(Direction4Way.Up),
      FDef.default(up),
      0.7, atlas,
      new ivec2(1, 2), true, props);
  }
  private getKeySpriteFrameDef(name: string, orReturnDefaultKeySprite: boolean = false): SpriteFrameDefinition {
    let ret: SpriteFrameDefinition = null;
    for (let f of this._defs) {
      if (Utils.copyString(f.name).toLowerCase().trim() === Utils.copyString(name).toLowerCase().trim()) {
        ret = f;
        break;
      }
    }

    //Didn't find a is_key sprite so just return the lowest sprite ID.  This will correspond to the top left corner of all frame blocks.
    if (!ret && orReturnDefaultKeySprite) {
      for (let f of this._defs) {
        if (!ret || f.tiled_id < ret.tiled_id) {
          ret = f;
        }
      }
    }

    return ret;
  }

  private validateNoDupes(def: SpriteFrameDefinition) {
    if (this._spriteLUT.get(def.tiled_id)) {
      Globals.logWarn("Tile id '" + def.tiled_id + " " + "' was already contained in the tile LUT!");
      Globals.debugBreak();
    }
  }

  private _next_helix_id: Int = toInt(1);
  private genHelixSpriteId(): Int {
    let id = toInt(this._next_helix_id);
    this._next_helix_id++;
    return id;
  }
  private addToLUT(tiledId: TiledTileId, helixId: HelixTileId, frameId: Int) {
    if (this._spriteLUT.get(tiledId)) {
      Globals.logError("Tile was already found in LUT.");
      Globals.debugBreak();
    }
    this._spriteLUT.set(tiledId, helixId);
    this._frameLUT.set(tiledId, frameId);
  }

}
export class TileMapTileData {
  public TileID: HelixTileId = MasterMap.EMPTY_TILE;
  public FrameIndex: Int = toInt(0);
  public constructor(id: HelixTileId, frameIndex: Int) {
    this.TileID = id;
    this.FrameIndex = frameIndex;
  }
}
export class TileMapLayerData {
  public data: Array<TileMapTileData> = new Array<TileMapTileData>();
}
export class TileMapData {
  //Holds all cell & frame data for the world map.
  //This is the parsed data from the TMX JSON
  //Holds all tile data closer to our format with objects and tiles at the root cell.
  private _width: Int;
  private _height: Int;
  private _layers: Array<TileMapLayerData> = new Array<TileMapLayerData>();

  public PlayerStartXY: ivec2 = null;
  public errors: string = "";
  private _spriteDefs: SpriteDefs = null;

  public get Sprites(): SpriteDefs { return this._spriteDefs; }

  public get Layers(): Array<TileMapLayerData> { return this._layers; }
  public get Width(): Int { return this._width; }
  public get Height(): Int { return this._height; }

  public constructor(atlas: Atlas, map: TmxMap, tileset: TmxTileset) {
    this._width = map.width;
    this._height = map.height;


    this._spriteDefs = new SpriteDefs(atlas, tileset);

    this.parseMap(map);

    if (Globals.isDebug()) {
      this.debugPrint();
    }
  }
  // private getProp<T>(prop: string, props: Array<TmxProperty>, nocase: boolean = true): T {
  //   for (let p of props) {
  //     if (nocase) {
  //       if (p.name.trim().toLowerCase() === prop.trim().toLowerCase()) {
  //         return p.value as unknown as T;
  //       }
  //     }
  //   }
  //   return null;
  // }


  public setTile(x: Int, y: Int, layer: Int, spriteId: HelixTileId, frame: Int) {
    if (spriteId === null) {
      this.errors += "set tile value was null.\r\n";
    }
    if (y < 0 || y >= this.Height) {
      return;
    }
    if (x < 0 || x >= this.Width) {
      return;
    }
    try {
      if (this.Layers && layer < this.Layers.length) {
        let off = this.xyToLinear(x, y);
        if (this.Layers[layer].data.length > off) {
          this.Layers[layer].data[off] = new TileMapTileData(spriteId, frame);
          return;
        }
      }
    }
    catch (ex) {
      Globals.debugBreak();
      this.errors += "setTile - " + ex + "\r\n";//errorthis.tiledata_set_errors++;

    }
  }
  public xyToLinear(x: Int, y: Int): Int {
    let ret: Int = toInt(y * this.Width + x);
    return ret;

  }
  public linearToX(iTile: Int): Int {
    let tile_x: Int = toInt(toInt(iTile) % toInt(this.Width));
    return tile_x;
  }
  public linearToY(iTile: Int): Int {
    let tile_y: Int = toInt(iTile / this.Width);
    return tile_y;
  }
  public linearToXY(iTile: Int): ivec2 {
    let tile_x: Int = this.linearToX(iTile);
    let tile_y: Int = this.linearToY(iTile);
    return new ivec2(tile_x, tile_y);
  }
  public cellHasTileXY(col: Int, row: Int, tile: Int): boolean {
    //Searches for the given tileID in the stack.
    for (let iLayer: Int = 0 as Int; iLayer < this.Layers.length; ++iLayer) {
      if (this.tileXY_World(col, row, iLayer) === tile) {
        return true;
      }
    }
    return false;
  }
  public tileXY_World(x: Int, y: Int, layer: Int): Int {
    //Returns the tileindex at the XY offset.
    let tile: TileMapTileData = this.tileXY_World_Object(x, y, layer);
    if (tile === null) {
      return MasterMap.EMPTY_TILE as Int;
    }
    return tile.TileID;
  }
  public tileXY_World_Object(x: Int, y: Int, layer: Int): TileMapTileData {
    //Returns the tile object with the sprite, and the frame
    let ret: TileMapTileData = null;
    if (y >= this.Height || y < 0) {
      ret = null;
    }
    else if (x >= this.Width || x < 0) {
      ret = null;
    }
    else if (layer >= this.Layers.length) {
      ret = null;
    }
    else {
      try {
        let idx = this.xyToLinear(x, y);
        ret = this.Layers[layer].data[idx];
      }
      catch (ex) {
        Globals.debugBreak();
        this.errors += "tileXY_World_Object - " + ex + "\r\n";
      }
    }
    return ret;
  }
  private allocData(map: TmxMap) {
    this._layers = new Array<TileMapLayerData>();
    for (let iLayer = 0; iLayer < map.layers.length; ++iLayer) {
      this.Layers.push(new TileMapLayerData());
      this.Layers[iLayer].data = new Array<TileMapTileData>();

      for (let iy = 0 as Int; iy < this.Height; ++iy) {
        for (let ix = 0; ix < this.Width; ++ix) {
          this.Layers[iLayer].data.push(new TileMapTileData(MasterMap.EMPTY_TILE, toInt(0)));
        }
      }

    }
  }
  private dbg_count = 0;
  private parseMap(map: TmxMap) {

    Globals.logDebug("Parsing Tiled Map into Helix map...");
    this.allocData(map);
    //This is actually necessary now that we are using tiled tilesets.
    //basically tiled doesn't guarantee the IDs of tilesets to stay the same so we
    //parse the tileset Id's and translate them into Helix tile ids.
    //Also this finds the player start xy.
    //Performs some math operations on tile sets, and 
    //We don't use zero, but -1 the Tileset enum starts at 1
    let debug_did_not_find: string = "";
    for (let layer of map.layers) {
      //string to enum
      let layerId: Int = TileLayerId[(layer.name as string) as keyof typeof TileLayerId] as Int;

      if (layerId === -1) {
        Globals.debugBreak();
      }
      else {
        if (layer.data) {
          for (let iTile = 0; iTile < layer.data.length; iTile++) {
            let tiled_tileid: Int = layer.data[iTile];
            let helix_tileid: Int = toInt(MasterMap.EMPTY_TILE);
            let helix_tile_frame: Int = toInt(0);
            let tilexy: ivec2 = this.linearToXY(toInt(iTile));

            //***SO***  Tile Id's are +1 in the EXPORTED TILED JSON file.  NOT in the Tiled map or the tiled tileset.
            //Really annoying, can I get a beer over here?
            tiled_tileid = toInt(tiled_tileid as number - 1);
            let name = "";

            if (tiled_tileid === -1) {
              //-1 ie empty, or 0
              helix_tileid = MasterMap.EMPTY_TILE;
            }
            else {
              helix_tileid = this.Sprites.tiledIdtoHelixId(tiled_tileid);
              helix_tile_frame = this.Sprites.getTileFrameIndex(tiled_tileid, helix_tileid);
            }

            if (helix_tileid === null) {
              helix_tileid = MasterMap.EMPTY_TILE;
              debug_did_not_find += tiled_tileid + ",";
            }

            if (helix_tileid !== MasterMap.EMPTY_TILE) {
              //Debug - name of sprite
              if (Globals.isDebug()) {
                let tile = this.Sprites.getTile(helix_tileid);
                if (tile === null) {
                  //This should never happen.
                  Globals.debugBreak();
                }
                else {
                  name = this.Sprites.getTile(helix_tileid).Name;
                }
              }
            }

            this.setTile(tilexy.x, tilexy.y, layerId, helix_tileid, helix_tile_frame);

            //Check the tile id's for special things
            if (helix_tileid === this.Sprites.PlayerTileId) {
              //here is our start point, flood fill this area.
              this.PlayerStartXY = new ivec2(tilexy.x, tilexy.y);
            }

          }
        }
      }

    }


    if (debug_did_not_find.length > 0) {
      Globals.logError("Found some NULL tile IDs, this may not be a real error,\r\n " +
        "becasue blank tiles may have accidently been set in the Tiled Map, however it should be fixed (just clear the tile in TILED): \r\n" + debug_did_not_find + "\r\n");
      Globals.logError("Printing our parsed LUT for reference:");
      this.Sprites.debug_printLUT();
    }
    Globals.logDebug("...Done parsing tiled map into helix map.")

  }
  private tileCount(id: Int): number {
    let ret = 0;
    for (let iy = 0; iy < this.Height; ++iy) {
      for (let ix = 0; ix < this.Width; ++ix) {
        for (let layer = 0; layer < this.Layers.length; ++layer) {
          let xx = this.tileXY_World(ix as Int, iy as Int, layer as Int);
          if (xx === id) {
            ret++;
          }
        }
      }
    }
    return ret;
  }
  private debugPrint() {
    if (Globals.isDebug()) {
      //debug gent iles.
      let mapTiles: Map<Int, Int> = new Map<Int, Int>();
      let tiles: string = "";
      let del: string = "";
      for (let iLayer = 0; iLayer < this.Layers.length; ++iLayer) {
        for (let xx = 0; xx < this.Layers[iLayer].data.length; ++xx) {
          let t = this.Layers[iLayer].data[xx].TileID;
          tiles += del + t;
          del = ",";
          mapTiles.set(t, t);
        }
      }
      let unique: string = "";
      for (let [k, v] of mapTiles) {
        let t = this.Sprites.getTile(k);
        unique += "[" + k + "," + (t ? (t.Name) : "ERROR:COULD NOT FIND A SPRITE") + "],";
      }
      console.log("Helix Unique Tiles:\n" + unique);
      console.log("Helix Converted Tilemap:\n" + tiles);
    }
  }
}
export class MasterMap {
  //The entire game world in one Tiled data file.  
  //This class is the container, it's job is mostly to create the world and
  //map ponints from Map space to World space.
  public static readonly UNDEFINED_TILE: Int = toInt(-2);
  public static readonly EMPTY_TILE: Int = toInt(-1);

  private _atlas: Atlas = null;
  public _area: MapArea = null; //{ get; private set; }

  private DoorTilesLUT: Array<Int> = new Array<Int>();
  private _tileMap: TileMapData = null;

  private _mapWidthTiles: Int;
  private _mapHeightTiles: Int;
  private _mapLayerCount: Int;

  public get MapData(): TileMapData { return this._tileMap; }
  public get Area(): MapArea { return this._area; }
  public get Atlas(): Atlas { return this._atlas; }
  public get MapLayerCount(): Int { return this._mapLayerCount; }
  public get MapWidthTiles(): Int { return this._mapWidthTiles; }
  public get MapHeightTiles(): Int { return this._mapHeightTiles; }

  public static tileTypeIsSpecial(type: HelixTileType): boolean {
    let b = (type === HelixTileType.PortalTrigger);
    b = b || (type === HelixTileType.BorderBlocker);
    b = b || (type === HelixTileType.Conduit);
    return b;
  }
  public constructor(atlas: Atlas) {
    this._atlas = atlas;

    let tile_set: TmxTileset = JSON.parse(JSON.stringify(master_tileset));
    if (Globals.isDebug()) {
      Globals.logDebug("Tiles:\r\n" + JSON.stringify(master_tileset));
    }

    let map: TmxMap = JSON.parse(JSON.stringify(world_data));
    if (Globals.isDebug()) {
      Globals.logDebug("Tile Map:\r\n" + JSON.stringify(world_data));
    }

    this._mapWidthTiles = map.width;
    this._mapHeightTiles = map.height;
    this._mapLayerCount = map.layers.length as Int;

    //Create the map
    this._tileMap = new TileMapData(atlas, map, tile_set);

    if (this._tileMap.PlayerStartXY === null) {
      Globals.logError("Could not find a player start position.  Make sure is_player is a true property on the sprite and it is added to the map.");
      Globals.debugBreak();
    }

    this.makeMapArea(this._tileMap.PlayerStartXY);

    if (this._tileMap && this._tileMap.errors.length) {
      Globals.logError("Tilemap errors: " + this._tileMap.errors + ".");
    }


  }
  public update(dt: number) {
    this._tileMap.Sprites.update(dt);
  }
  private makeMapArea(startxy: ivec2) {
    if (startxy.x != Number.MAX_SAFE_INTEGER as Int) {
      //Cleanup
      //this.Grid = null;

      //Find the boundary x/y of the map so we can make a grid
      this._area = new MapArea(this, startxy);

      //MUST COME BEFORE GENERATE GAME OBJECTS
      // GenerateDoors();

      // //Generate objects  / Doors
      // GenerateWorldObjects();

      // MakeWallTorches();
    }
    else {
      //YOU DIDNT SET THE PLAYER ANYWHERE
      //Failed to find the guy tile.
      Globals.debugBreak();
    }
  }

  public worldPointToMapPoint(v_in: vec3): vec3 {
    //Converts an OpenGL coordinate system point to a point relative to the MasterMap origin.
    let v: vec3 = new vec3(
      v_in.x,
      -v_in.y,
      v_in.z
    );
    return v;
  }
  public project(p1: vec3, p2: vec3, normal: vec3, position: vec3): vec3 {
    //Projects the given line segment onto this world
    //Input: OpenGL World coordinates
    //Returns OpenGL World coordinates.


    //(n.p+d) = (a+tb)
    let n = normal;
    let d = -(n.dot(position));
    let t: number = -(n.dot(p1) + d) / ((p2.clone().sub(p1)).dot(n));
    let ret = p1.clone().add(p2.clone().sub(p1).multiplyScalar(t));
    return ret;

  }

}
export class MapArea {
  //A piece of a platform map that was found by flood filling to border tiles.
  public RoomId: Int;
  public Min: ivec2 = new ivec2(0 as Int, 0 as Int);
  public Max: ivec2 = new ivec2(0 as Int, 0 as Int);
  public Tiles: IVec2Set = new IVec2Set(); //All of the tile locations found in this room relative to the Master Map
  public Border: IVec2Set = new IVec2Set(); //Border Tile Locations
  public Doors: IVec2Set = new IVec2Set(); // Door Tile Locations
  public WidthTiles: Int = -1 as Int;
  public HeightTiles: Int = -1 as Int;
  public Grid: TileGrid = null;
  public Map: MasterMap = null;

  public constructor(map: MasterMap, startxy: ivec2) {
    this.Min.x = this.Min.y = Number.MAX_SAFE_INTEGER as Int;
    this.Max.x = this.Max.y = -Number.MAX_SAFE_INTEGER as Int;

    this.Map = map;
    this.debug_numfloodfill = 0 as Int;

    this.floodFillFromPointRecursive(startxy);
    this.validate();

    //Make the grid
    this.Grid = new TileGrid(this, this.WidthTiles, this.HeightTiles, map.MapLayerCount as Int);

    Globals.logDebug("Floodfill called " + this.debug_numfloodfill + " times.");
    if (this.Grid.errors.length) {
      Globals.logError(this.Grid.errors);
    }

  }
  public validate() {
    if (this.Min.x > this.Max.x || this.Min.y > this.Max.y) {
      Globals.debugBreak();//System.Diagnostics.Debugger.Break();
    }
    if (this.Border.count === 0 as Int) {
      Globals.logError("Did not find any room border tiles.");
    }
    if (this.Tiles.count === 0 as Int) {
      //Don't know whyt his would happen.
      Globals.debugBreak();//System.Diagnostics.Debugger.Break();
    }
    if (this.Tiles.count > 10000)//For the first area we're at 5670 so still, pretty big
    {
      //Level is Too Big
      //You probably forgot a portal or delimiter wall somewhere.
      Globals.debugBreak();// System.Diagnostics.Debugger.Break();
    }

    //Subtract 1 for the outside border.
    this.WidthTiles = (this.Max.x - this.Min.x + (1 as Int)) as Int;
    this.HeightTiles = (this.Max.y - this.Min.y + (1 as Int)) as Int;
  }
  private debug_numfloodfill = 0;
  public floodFillFromPointRecursive(pt_origin: ivec2) {
    //Flood fill an area demarcated by the boundary.
    let toCheck: Array<ivec2> = new Array<ivec2>();
    toCheck.push(pt_origin);

    while (toCheck.length > 0) {
      this.debug_numfloodfill++;//degbug
      let pt: ivec2 = toCheck[toCheck.length - 1];

      toCheck.splice(toCheck.length - 1, 1);

      if (pt.x < 0 || pt.y < 0 || pt.x > this.Map.MapWidthTiles || pt.y > this.Map.MapHeightTiles) {
        continue;
      }

      //Get the tile from the BORDER tile layer.
      // let iTile: Int = this.TileXY_World(pt.x, pt.y, TileLayer.Border as Int);
      // let iTile_Door: Int = this.TileXY_World(pt.x, pt.y, TileLayer.Objects as Int);

      let isBorder: boolean = this.Map.MapData.cellHasTileXY(pt.x, pt.y, this.Map.MapData.Sprites.BorderTileId);
      let isDoor: boolean = this.Map.MapData.cellHasTileXY(pt.x, pt.y, this.Map.MapData.Sprites.DoorTileId);

      if (this.Tiles.has(pt)) {
        //do nothing
      }
      else if (isBorder) {
        if (!this.Border.has(pt)) {
          this.Border.set(pt);

          //Include Corner border tiles.
          //This is needed to see if a door that lies on a border corner is a portal door
          //otherwise we wouldn't include cornder borders in the flood fill
          this.floodFillAddNeighborBorder(pt.clone().add(new ivec2(-1, 0)), this.Border);
          this.floodFillAddNeighborBorder(pt.clone().add(new ivec2(1, 0)), this.Border);
          this.floodFillAddNeighborBorder(pt.clone().add(new ivec2(0, -1)), this.Border);
          this.floodFillAddNeighborBorder(pt.clone().add(new ivec2(0, 1)), this.Border);
        }
      }
      // else if (isDoor) {//this.DoorTilesLUT.indexOf(iTile) >= 0) {  Old method
      //   ///So the TODO here is to be able to figure out which side of the border the door is on
      //   if (!this.Border.has(pt)) {
      //     this.Doors.set(pt);
      //   }
      // }
      else {
        //Add the found tile to the set of tiles.
        this.Tiles.set(pt);

        //Increase the room's boundbox
        if (pt.x < this.Min.x) { this.Min.x = pt.x; }
        if (pt.y < this.Min.y) { this.Min.y = pt.y; }
        if (pt.x > this.Max.x) { this.Max.x = pt.x; }
        if (pt.y > this.Max.y) { this.Max.y = pt.y; }

        //Were not a border, continue to search.
        toCheck.push(pt.clone().add(new ivec2(-1, 0)));
        toCheck.push(pt.clone().add(new ivec2(1, 0)));
        toCheck.push(pt.clone().add(new ivec2(0, -1)));
        toCheck.push(pt.clone().add(new ivec2(0, 1)));
      }
    }
  }
  public floodFillAddNeighborBorder(v: ivec2, border: IVec2Set) {
    //Search for border on any layer (convenience thing)
    if (this.Map.MapData.cellHasTileXY(v.x, v.y, this.Map.MapData.Sprites.BorderTileId)) {
      if (!border.has(v)) {
        border.set(v);
      }
    }
  }
  public tileIsInMapArea(x: Int, y: Int): boolean {
    return this.Tiles.has(new ivec2(x, y));
  }


}
export class TileGrid {
  //This is the node BVH tree of the Master Map
  //public Level: MasterMap = null; //  { get; private set; }
  public Area: MapArea = null;
  public RootNode: BvhNode = null;//{ get; set; }
  public CellDict: IVec2Map<Cell> = new IVec2Map<Cell>();//Dictionary..
  private dbg_numnodes: Int = 0 as Int;
  private dbg_numcells: Int = 0 as Int;
  private NumLayers: Int = 0 as Int;
  public Patterns: TilePatterns = null;
  public errors: string = "";

  public constructor(area: MapArea, tilesW: Int, tilesH: Int, nLayers: Int) {
    this.Area = area;
    this.NumLayers = nLayers;

    this.Patterns = new TilePatterns();

    this.RootNode = new BvhNode(area, this.GetGridExtents(tilesW, tilesH));
    this.DivideGrid(this.RootNode, 1 as Int);
  }
  private DivideGrid(parent: BvhNode, iCallstack: Int) {
    if (iCallstack > 100) {
      Globals.debugBreak();
    }
    if (parent.Box.Width() <= 0) {
      Globals.debugBreak();
      //System.Diagnostics.Debugger.Break();
    }
    if (parent.Box.Height() <= 0) {
      Globals.debugBreak();
      //System.Diagnostics.Debugger.Break();
    }

    //Double sanity - we must always be evenly divisible by tiles.
    let wwww = parent.Box.Width();
    let test = (wwww % this.Area.Map.Atlas.TileWidthR3) as Int;
    if (test !== 0) {
      Globals.debugBreak();
    }
    let test2 = (parent.Box.Height() % this.Area.Map.Atlas.TileHeightR3) as Int;
    if (test2 !== 0) {
      Globals.debugBreak();
    }

    let boxwh: vec2 = (parent.Box.Max.clone().sub(parent.Box.Min));
    let tilesXParent: Int = toInt(boxwh.x / this.Area.Map.Atlas.TileWidthR3);
    let tilesYParent: Int = toInt(boxwh.y / this.Area.Map.Atlas.TileHeightR3);
    let tilesXMid: Int = toInt((boxwh.x / this.Area.Map.Atlas.TileWidthR3) * 0.5);
    let tilesYMid: Int = toInt((boxwh.y / this.Area.Map.Atlas.TileHeightR3) * 0.5);

    if (tilesXParent === 1 as Int && tilesYParent === 1 as Int) {
      let cellPos: ivec2 = new ivec2(
        toInt(parent.Box.Min.x / this.Area.Map.Atlas.TileWidthR3),
        toInt(parent.Box.Min.y / this.Area.Map.Atlas.TileHeightR3)
      );
      parent.Cell = new Cell(parent, this.NumLayers, cellPos);

      if (this.CellDict.has(cellPos)) {
        //Error: cell already found
        Globals.debugBreak();
      }
      else {
        this.CellDict.set(cellPos, parent.Cell);
      }

      //Make sure the tile is within the area before we compute it. We have divided a square region, but the area is probably not square.
      if (this.Area.tileIsInMapArea(cellPos.x, cellPos.y)) {
        this.setCellData(parent.Cell, cellPos);
      }

      this.dbg_numcells++;
    }
    else {
      let A: Box2f = null;
      let B: Box2f = null;

      if (tilesXParent > tilesYParent) {
        let midx: number = parent.Box.Min.x + (tilesXMid as number) * this.Area.Map.Atlas.TileWidthR3;

        A = Box2f.construct(new vec2(parent.Box.Min.x, parent.Box.Min.y), new vec2(midx, parent.Box.Max.y));
        B = Box2f.construct(new vec2(midx, parent.Box.Min.y), new vec2(parent.Box.Max.x, parent.Box.Max.y));
      }
      else {
        let midy: number = parent.Box.Min.y + (tilesYMid as number) * this.Area.Map.Atlas.TileHeightR3;

        A = Box2f.construct(new vec2(parent.Box.Min.x, parent.Box.Min.y), new vec2(parent.Box.Max.x, midy));
        B = Box2f.construct(new vec2(parent.Box.Min.x, midy), new vec2(parent.Box.Max.x, parent.Box.Max.y));
      }

      parent.Children = new Array<BvhNode>(2);
      parent.Children[0] = new BvhNode(this.Area, A);
      parent.Children[1] = new BvhNode(this.Area, B);

      this.dbg_numnodes = roundToInt(this.dbg_numnodes as number + 2);

      let i = 0;
      for (let n of parent.Children) {
        this.DivideGrid(n, iCallstack + 1 as Int);
        i++;
      }
    }

  }
  private setCellData(c: Cell, cellPos: ivec2) {
    //Set the Cell Data.  This is where the love happens.
    for (let iLayer = 0; iLayer < this.Area.Map.MapLayerCount; iLayer++) {
      let tile: TileMapTileData = this.Area.Map.MapData.tileXY_World_Object(cellPos.x, cellPos.y, iLayer as Int);

      if (tile && tile.TileID !== MasterMap.EMPTY_TILE && tile.TileID !== this.Area.Map.MapData.Sprites.BorderTileId) {
        let tileSprite: Sprite25D = this.Area.Map.MapData.Sprites.getTile(tile.TileID);

        if (!tileSprite) {
          this.errors += "Could not find tile def (TileDef) for helix tile ID " + tile.TileID + "\r\n";

          if (tile.TileID > 1000) {
            Globals.debugBreak();
          }
        }
        else {
          let computed_tile_data: { sprite: Sprite25D, frame: Int, layer: Int, animation: SpriteAnimationData } = {
            sprite: tileSprite,
            frame: toInt(-1),
            layer: toInt(iLayer),
            animation: tileSprite.Animation.TileData
          };

          if (tileSprite.TileType == HelixTileType.CellTile) {
            this.getSpriteTileFrame(c.CellPos_World.x, c.CellPos_World.y, toInt(iLayer as number), tileSprite, tile, computed_tile_data);
          }
          else if (tileSprite.TileType == HelixTileType.Object) {
            //Objects are multi-sized.  IDK really.  Should just be a tilesprite.
          }

          //Add a tile block.
          if (computed_tile_data.frame >= 0) {
            c.Blocks.push(new TileBlock());
            c.Blocks[c.Blocks.length - 1].SpriteRef = computed_tile_data.sprite;
            c.Blocks[c.Blocks.length - 1].FrameIndex = computed_tile_data.frame;
            c.Blocks[c.Blocks.length - 1].Layer = computed_tile_data.layer;
            c.Blocks[c.Blocks.length - 1].AnimationData = computed_tile_data.animation;
          }


        }
      }
    }

  }
  public GetCell(xy: ivec2): Cell {
    let cell: Cell = null;
    //Gets the cell at the grid pos
    cell = this.CellDict.get(xy);
    return cell;
  }
  public GetCellForPoint_WorldR3(pos: vec3): Cell {
    return this.GetCellForPoint_World(new vec2(pos.x, pos.y));
  }
  public GetCellForPoint_World(pos: vec2): Cell {
    let parent: BvhNode = this.RootNode;
    let ret: Cell = null;

    let nSanity: Int = 0 as Int;//Instead of using a while true loop we do this to prevent catastrophic failure
    while (nSanity < 1000) {
      for (let n of parent.Children) {
        if (n.Box.ContainsPoint_TL_INCLUSIVE_BR_EXCLUSIVE(pos)) {
          if (n.Cell != null) {
            ret = n.Cell;
            nSanity = 1005 as Int;
          }
          else {
            parent = n;
          }

          break;
        }
      }

      nSanity++;
    }
    return ret;
  }
  public GetSurroundingCells(c: Cell, corners: boolean = false): Array<Cell> {
    //If corners is false, you skip the corners of the 3x3 grid
    let n: Array<Cell> = new Array<Cell>(9);
    n[4] = c;
    if (c == null) { return n; }

    for (let j: Int = -1 as Int; j <= 1; ++j) {
      for (let i: Int = -1 as Int; i <= 1; ++i) {
        if (i === 0 && j === 0) {
          //Skip center
        }
        else if (corners == false && ((i == -1 && j == -1) || (i == 1 && j == 1) || (i == -1 && j == 1) || (i == 1 && j == -1))) {
          //Skip corners if they're false
        }
        else {
          let ind: Int = ((j + 1) * 3 + (i + 1)) as Int;
          n[ind] = this.GetNeighborCell(c, i, j);
        }
      }
    }
    return n;
  }
  public GetGridExtents(tilesW: Int, tilesH: Int): Box2f {
    let tw = this.Area.Map.Atlas.TileWidthR3;
    let th = this.Area.Map.Atlas.TileHeightR3;

    let b: Box2f = Box2f.construct(
      new vec2(this.Area.Min.x, this.Area.Min.y),
      new vec2(this.Area.Min.x * tw + tilesW * tw, this.Area.Min.y * th + tilesH * th));
    return b;
  }
  public GetCellManifoldForBox(b: Box2f): Array<Cell> {
    let x: Int = Math.floor(b.Min.x / this.Area.Map.Atlas.TileWidthR3) as Int;
    let y: Int = Math.floor(b.Min.y / this.Area.Map.Atlas.TileHeightR3) as Int;

    let w: Int = (Math.ceil(b.Width() / this.Area.Map.Atlas.TileWidthR3) + 1) as Int;
    let h: Int = (Math.ceil(b.Height() / this.Area.Map.Atlas.TileHeightR3) + 1) as Int;

    let ret: Array<Cell> = new Array<Cell>();

    let vtmp: ivec2;
    for (let iy: Int = y; iy <= (y + h); ++iy) {
      for (let ix: Int = x; ix <= (x + w); ++ix) {
        vtmp = new ivec2(ix, iy);
        let c: Cell = this.CellDict.get(vtmp);
        if (c === null) {
          let n = 0; n++;
        }
        else if (c === undefined) {
          let n = 0; n++;
        }
        else {
          ret.push(c);
        }
      }
    }

    return ret;
  }
  public GetCellAbove(c: Cell): Cell {
    return this.GetNeighborCell(c, 0 as Int, -1 as Int);
  }
  public GetNeighborCell(c: Cell, x: Int, y: Int): Cell {
    //X increases right
    //Y increases down
    if (c == null) {
      return null;
    }
    let pt: vec2 = new vec2(
      c.Parent.Box.Min.x + this.Area.Map.Atlas.TileWidthR3 * (x as number) + this.Area.Map.Atlas.TileWidthR3 * 0.5,
      c.Parent.Box.Min.y + this.Area.Map.Atlas.TileHeightR3 * (y as number) + this.Area.Map.Atlas.TileHeightR3 * 0.5);
    let ret: Cell = this.GetCellForPoint_World(pt);
    return ret;
  }
  public getSpriteTileFrame(x: Int, y: Int, layer: Int, tileSprite: Sprite25D, tile: TileMapTileData, out_data: { sprite: Sprite25D, frame: Int, layer: Int }) {
    //let ret: Int = toInt(0);
    out_data.sprite = tileSprite;
    out_data.layer = toInt(layer);

    if (tileSprite.Tiling === Tiling.RandomSprite) {
      this.selectRandomSpriteAndFrame(tileSprite, out_data);
    }
    else if (tileSprite.Tiling === Tiling.RandomFrame) {
      out_data.frame = this.selectRandomFrame(tileSprite);
    }
    else if (tileSprite.Tiling === Tiling.FoliageTiling) {
      out_data.frame = this.GetTileIndexFoliageBorder(x, y, layer, tile.TileID);
    }
    else if (tileSprite.Tiling === Tiling.FenceRules) {
      out_data.frame = this.GetTileIndexFence(x, y, layer, tile.TileID);
    }
    // else if (tileSprite.Tiling === Tiling.Set3x3Block) {
    //   ret = this.GetTileIndex3x3Block(x, y, layer, tileId, HashSet.construct<Int>([tileId]), true);
    // }
    // else if (tileSprite.Tiling === Tiling.Set3x3Seamless) {
    //   ret = this.GetTileIndex3x3Seamless(x, y, layer, tileId, HashSet.construct<Int>([tileId]), true);
    // }
    else if (tileSprite.Tiling === Tiling.HardBorderRules) {
      out_data.frame = this.GetTileIndexHardBorder(x, y, layer, tile.TileID);
    }
    else if (tileSprite.Tiling === Tiling.DockRules) {
      let arr = this.getSurroundingTiles3x3(x, y, tile.TileID, layer, HashSet.construct<Int>([tile.TileID]), true);
      let h: boolean = false;
      let v: boolean = false;
      if (arr[3] && arr[5]) {
        h = true;
      }
      if (arr[1] && arr[7]) {
        v = true;
      }
      if (h && !v) {
        out_data.frame = toInt(0);
      }
      else if (!h && v) {
        out_data.frame = toInt(1);
      }
      out_data.frame = toInt(0);
    }
    else if (tileSprite.Tiling === Tiling.None) {
      out_data.frame = tile.FrameIndex;
    }
    else {
      Globals.logError("Invalid tiling type for setCellData() for sprite '" + tileSprite.Name + "': " + tileSprite.Tiling);
    }

    if (out_data.frame >= tileSprite.Animation.TileData.KeyFrames.length) {
      Globals.logError("Invalid keyframe " + out_data.frame + " for tile sprite " + tileSprite.Name);
      Globals.debugBreak();
      out_data.frame = toInt(0);
    }

    return out_data.frame;
  }
  private err(s: string) {
    this.errors += s + "\r\n"
  }
  private selectRandomSpriteAndFrame(tileSprite: Sprite25D, out_data: { sprite: Sprite25D, frame: Int, layer: Int }) {
    let ss = this.Area.Map.MapData.Sprites.getSpriteRandomSet(tileSprite);

    if (ss) {
      out_data.sprite = ss.select();
      if (out_data.sprite) {
        out_data.frame = this.selectRandomFrame(out_data.sprite);
      }
      else {
        this.err("Could not select random sprite for " + tileSprite.Name + ".");
      }
    }
    else {
      this.err("Random set for sprite " + tileSprite.Name + " was not found.");
    }

  }
  private selectRandomFrame(sp: Sprite25D) {
    let ret: Int = toInt(-1);
    let frs = this.Area.Map.MapData.Sprites.getFrameRandomSet(sp);
    if (frs) {
      let kf: SpriteKeyFrame = frs.select();
      if (kf) {
        ret = kf.Index;
      }
      else {
        this.err("Did not select valid keyframe for randomly selected tile sprite " + sp.Name + ".");
      }
    }
    else {
      this.err("Random frame set for randomly selected sprite" + sp.Name + " was not found.");
    }
    return ret;
  }
  public GetTileIndexFoliageBorder(col: Int, row: Int, layer: Int, tileId: Int): Int {
    let ret: Int = toInt(0);
    let x: boolean = (col % 2) === 0;
    let y: boolean = (row % 2) === 0;

    let arr = this.getSurroundingTiles3x3(col, row, tileId, layer, HashSet.construct<Int>([tileId]), true);

    ret = toInt(2);//Bush

    //Tree
    if (x && y) {
      if (arr[5] && arr[7] && arr[8]) {
        ret = toInt(0);
      }
    }
    else if (!x && y) {
      if (arr[3] && arr[7] && arr[6]) {
        ret = toInt(1);
      }
    }
    else if (x && !y) {
      if (arr[1] && arr[5] && arr[2]) {
        ret = toInt(3);

      }
    }
    else if (!x && !y) {
      if (arr[1] && arr[3] && arr[0]) {
        ret = toInt(4);
      }
    }

    return ret;
  }
  public GetTileIndexHardBorder(col: Int, row: Int, layer: Int, tileId: Int): Int {
    let ret: Int = toInt(0);

    //**For the border sprites we use the layer below. 
    let layerBelow = layer - 1;
    let tileBelow: Int = this.Area.Map.MapData.tileXY_World(col, row, layerBelow as Int);
    let arr = this.getSurroundingTiles3x3(col, row, tileBelow, layerBelow as Int, HashSet.construct<Int>([tileBelow]), true);

    let pat: Int = this.crankPattern(this.Patterns.TilePatternsHardBorder, arr, toInt(9), toInt(7), toInt(4));

    return pat;
  }


  public GetTileIndexFence(col: Int, row: Int, layer: Int, tileId: Int): Int {
    let ret: Int = toInt(0);

    let arr = this.getSurroundingTiles3x3(col, row, tileId, layer, HashSet.construct<Int>([tileId]), true);

    let pat: Int = this.crankPattern(this.Patterns.TilePatternsFence, arr, toInt(9), toInt(7), toInt(4));

    return pat;
  }

  public GetTileIndex3x3Block(col: Int, row: Int, layer: Int, tileId: Int, seamless_ids: HashSet<Int>, bContinue: boolean = true): Int {
    return this.GetTileIndex3x3(col, row, layer, tileId, seamless_ids, bContinue, true);
  }
  public GetTileIndex3x3Seamless(col: Int, row: Int, layer: Int, tileId: Int, seamless_ids: HashSet<Int>, bContinue: boolean = true): Int {
    return this.GetTileIndex3x3(col, row, layer, tileId, seamless_ids, bContinue, false);
  }
  public GetTileIndex3x3(col: Int, row: Int, layer: Int, tileId: Int, seamless_ids: HashSet<Int>, bContinue: boolean = true, block: boolean = true): Int {
    //bContinue - Continue the tiling when we hit the level border.
    //The tiles should all be the same in the spritesheett
    //**Important note: Seamless ID's MUST contain the tile at least. 
    if (!seamless_ids || seamless_ids.length === 0) {
      Globals.logError("Seamless ids of generated tiles  must at least contain the tile id.");
      Globals.debugBreak();
    }

    let arr = this.getSurroundingTiles3x3(col, row, tileId, layer, seamless_ids, bContinue);

    let pat: Int = this.crankPattern(block ? this.Patterns.TilePatterns3x3Block : this.Patterns.TilePatterns3x3Seamless, arr, toInt(9), toInt(7), toInt(4));

    return pat;
  }
  public getSurroundingTiles3x3(col: Int, row: Int, tileId: Int, layer: Int, seamless_ids: HashSet<Int>, bContinue: boolean = true): Array<boolean> {

    //Create a boolean array
    let arr: Array<boolean> = new Array<boolean>(9);
    for (let j: number = -1; j <= 1; ++j) {
      for (let i: number = -1; i <= 1; ++i) {

        let ind: number = (j + 1) * 3 + (i + 1);

        let cell_x: number = col + i;
        let cell_y: number = row + j;

        //Out of bounds check
        if (this.Area.Tiles.has(new ivec2(cell_x, cell_y)) === false) {
          //Seam the level border
          arr[ind] = true;
        }
        else {
          let txy: Int = this.Area.Map.MapData.tileXY_World(toInt(cell_x), toInt(cell_y), layer);
          if (txy === 0 && bContinue) {
            txy = tileId;  //continue outside the level border, 0 is null/no tile for TILED tiles.
          }

          //Else find the tile in the seamless tile id's
          arr[ind] = seamless_ids.has(txy);
        }
      }
    }
    return arr;
  }
  public crankPattern(list: MultiMap<Int, Array<Int>>, arr: boolean[], patternTileCount: Int, defaultvalue: Int, centerPat: Int): Int {
    //This algorithm matches an input pattern of tiles, to the a configured pattern, to generate
    //a sprite.  This is essentially an automatic tiling algorithm.
    //Loop arr, match with every pattern in "list" and return the corresponding key
    //Center pat is the center index - the pattern we ignore  = 4 for 3x3 and 1 for 1x3 or 3x1
    if (arr.length !== patternTileCount) {
      //Error
      Globals.debugBreak();
    }

    let ret: Int = defaultvalue;
    for (let frame of list.keys()) {
      let values: HashSet<Array<Int>> = null;

      values = list.get(frame);
      if (values) {
        for (const pat of values.entries()) {

          if (pat.length !== patternTileCount) {
            //Must have 9 tiles in the pattern.
            Globals.debugBreak();
          }

          let match: boolean = this.matchPattern(pat, arr, patternTileCount, centerPat);
          if (match === true) {
            return frame;
          }
        }

      }
    }

    return defaultvalue;
  }
  private matchPattern(pat: Array<Int>, arr: Array<boolean>, patternTileCount: Int, centerPat: Int): boolean {
    //Returns true if this pattern matches the input tile array.
    for (let iPat = 0; iPat < patternTileCount; ++iPat) {
      if (iPat === centerPat) {
        //Don't test the center square. That's what we're calculating.
        continue;
      }

      if (pat[iPat] === 2) {
        //2 = any tile here matches if we are 2, even 0
      }
      else if ((pat[iPat] === 1) !== arr[iPat]) {
        return false;
      }
    }


    return true;
  }
}
export class TileBlock {
  private _spriteRef: Sprite25D = null; //Reference to a Sprite25D, // Sprite for this block.  This also containst he TILE ID.  This is a REFERENCE to the tile.  Not a copy
  private _frameIndex: Int = 0 as Int;//The index of the frame that this sprite
  private _layer: Int = -1 as Int;
  private _animationData: SpriteAnimationData = null;
  public Box: Box2f;   // So we need custom boxes for things like ladders, &c

  public Verts: Array<vec3> = new Array<vec3>();

  public get AnimationData(): SpriteAnimationData { return this._animationData; }
  public set AnimationData(x: SpriteAnimationData) { this._animationData = x; }

  public get FrameIndex(): Int { return this._frameIndex; }
  public set FrameIndex(x: Int) { this._frameIndex = x; }

  public get SpriteRef(): Sprite25D { return this._spriteRef; }
  public set SpriteRef(x: Sprite25D) { this._spriteRef = x; }

  public get Layer(): Int { return this._layer; }
  public set Layer(x: Int) { this._layer = x; }

  public get Pos(): vec2 { return this.Box.Min; }
}
export class BvhNode {
  //A BVH node in the Master Map
  //public Level: MasterMap;//{ get; private set; }
  public Area: MapArea = null;
  //Node in a binary box tree - we don't use a quadtree because our grids are not square
  public Children: BvhNode[];
  public Cell: Cell = null;
  public Box: Box2f;//{ get; set; } // Box, in Game-world pixels (not device pixels)
  public constructor(area: MapArea, box: Box2f) {
    this.Area = area;
    this.Box = box;
  }
}
export class Cell {
  //This is a leaf node of the MapArea class, a single cell with fixed w/h
  private _cellPosWorld: ivec2;
  public _parent: BvhNode = null;//{ get; private set; }
  public Blocks: Array<TileBlock> = new Array<TileBlock>();

  public DebugColor: Color = null;
  public DebugVerts: Array<vec3> = new Array<vec3>();
  public static DebugFrame: SpriteFrame = null; // thisis just for debug

  public hasTile(s:string) : boolean { 
    for(let b of this.Blocks){
      if(b.SpriteRef){
        if(b.SpriteRef.Name === s){
          return true;
        }
      }
    }
    return false;
  }

  public isBlocked(layer: Int): boolean {
    for (let block of this.Blocks) {
      if (block.Layer === layer) {
        if (block.SpriteRef) {

          if (block.SpriteRef.canCollide()) {
            return true;
          }
        }

      }
    }
    return false;
  }
  public removeBlock(block: TileBlock): boolean {
    for (let bi = this.Blocks.length - 1; bi >= 0; bi--) {
      if (this.Blocks[bi] === block) {
        this.Blocks.splice(bi, 1);
        return true;
      }
    }
    return false;
  }
  public getOrderedBlockArrayTopDown(): Array<TileBlock> {
    //Returns the array of all blocks ordered from Front[0] to Back[n]
    //If this tile has multiple blocks on the same layer, then the order is the order in which they exist on the cell.
    let ret: Array<TileBlock> = new Array<TileBlock>();
    for (let iLayer = this._parent.Area.Map.MapLayerCount - 1; iLayer >= 0; --iLayer) {
      for (let block of this.Blocks) {
        if (block.Layer === iLayer) {
          ret.push(block);
        }
      }
    }
    return ret;
  }

  //Cell position relative to the master map.
  public get CellPos_World(): ivec2 { return this._cellPosWorld; }
  //Cell position relative to the map area min/max boundary.
  public get CellPos_Area(): ivec2 {
    let iv = new ivec2(
      this._cellPosWorld.x - this._parent.Area.Min.x,
      this._cellPosWorld.y - this._parent.Area.Min.y);
    return iv;
  }

  public get Parent(): BvhNode { return this._parent; }
  public set Parent(x: BvhNode) { this._parent = x; }

  public get BoundBox_World(): Box2f {
    return this.Parent.Box;
  }
  private _cached_tilepos_r3: vec3 = null;
  public get TilePosR3(): vec3 {
    return this._cached_tilepos_r3;
  }
  public constructor(parent: BvhNode, nLayers: number, cellPos: ivec2) {
    this._cellPosWorld = cellPos;
    this.Parent = parent;
    let g = (this._cellPosWorld.y / 44);
    let e = (this._cellPosWorld.x / 60);
    this.DebugColor = new Color(g, 0, e);//= Random.randomColor(0.4, 1.0);


    //Cache the R3 Pos - performance
    let cdx = this._cellPosWorld.x;
    let cdy = this._cellPosWorld.y; // Flipping y to turn into OpenGL coordinates.
    let cdz = 0;
    this._cached_tilepos_r3 = new vec3(cdx, cdy, cdz);
  }

  // public  GetTilePosGlobal() : ivec2
  // {
  //     return this.Parent.Level.Room.Min + GetTilePosLocal();
  // }
  // public DeviceBoundBox() : Box2f 
  // {
  //     let gridBox  : Box2f = new Box2f(
  //         this.Parent.Level.World.Screen.Viewport.WorldToDevice(Parent.Box.Min),
  //         this.Parent.Level.World.Screen.Viewport.WorldToDevice(Parent.Box.Max)
  //         );
  //     return gridBox;
  // }

}

class TilePatterns {
  //Tile Patterns.
  //center of the 3x3 - the tile in question
  //values:
  //0 - no tile is present
  //1 - a tile in this tileset is present
  //2 - ANY tile in this layer is present
  //Using numbers and converting to int later. Down the road... BigInt
  public TilePatterns3x3Seamless: MultiMap<Int, Array<Int>> = null;
  public TilePatterns3x3Block: MultiMap<Int, Array<Int>> = null;
  public TilePatternsFence: MultiMap<Int, Array<Int>> = null;
  public TilePatternsHardBorder: MultiMap<Int, Array<Int>> = null;
  public constructor() {
    //Convert numbered patterns to integer.
    //Why?  because we want to use Int type but having a toInt() on every number is hell.
    this.TilePatterns3x3Seamless = this.nPatToI(this.TilePatterns3x3Seamless_n);
    this.TilePatterns3x3Block = this.nPatToI(this.TilePatterns3x3Block_n);
    this.TilePatternsFence = this.nPatToI(this.TilePatternsFence_n);
    this.TilePatternsHardBorder = this.nPatToI(this.TilePatternsHardBorder_n);
  }
  private nPatToI(input: MultiMap<number, Array<number>>): MultiMap<Int, Array<Int>> {
    //Simple method to 
    let ret: MultiMap<Int, Array<Int>> = new MultiMap<Int, Array<Int>>();

    for (let k of input.keys()) {
      let nv: HashSet<Array<number>> = input.get(k);
      for (let nvx of nv.entries()) {
        let arrToI: Array<Int> = new Array<Int>();
        for (let ni = 0; ni < nvx.length; ++ni) {
          arrToI.push(toInt(nvx[ni]));
        }
        ret.set(toInt(k), arrToI);
      }
    }

    return ret;
  }

  private TilePatterns3x3Seamless_n = MultiMap.construct<number, Array<number>>([
    [0, new Array<number>(
      2, 0, 2,
      0, 1, 1,
      2, 1, 1)],
    [1, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      1, 1, 1)],
    [2, new Array<number>(
      2, 0, 2,
      1, 1, 0,
      1, 1, 2)],
    [3, new Array<number>(
      0, 0, 0,
      0, 1, 0,
      2, 1, 2)],
    [3, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      2, 1, 2)],
    [4, new Array<number>(
      2, 0, 2,
      0, 1, 1,
      2, 0, 2)],
    [5, new Array<number>(
      2, 0, 2,
      1, 1, 0,
      2, 0, 2)],

    //Row2
    [6, new Array<number>(
      2, 1, 1,
      0, 1, 1,
      2, 1, 1)],
    [7, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      1, 1, 1)],
    [8, new Array<number>(
      1, 1, 2,
      1, 1, 0,
      1, 1, 2)],
    [9, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 0, 2)],
    [10, new Array<number>(
      1, 1, 0,
      1, 1, 1,
      1, 1, 1)],
    [11, new Array<number>(
      0, 1, 1,
      1, 1, 1,
      1, 1, 1)],
    //Row 3
    [12, new Array<number>(
      2, 1, 1,
      0, 1, 1,
      2, 0, 2)],
    [13, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      2, 0, 2)],

    [14, new Array<number>(
      1, 1, 2,
      1, 1, 0,
      2, 0, 2)],


    [15, new Array<number>( //*This goes with 4 and 5
      2, 0, 2,
      1, 1, 1,
      2, 0, 2)],

    [16, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      0, 1, 0)],

    //Too many combos, use 2
    [17, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 1, 2)],

    //Row 4
    [18, new Array<number>(
      2, 1, 0,
      0, 1, 1,
      2, 1, 1)],
    [19, new Array<number>(
      0, 1, 2,
      1, 1, 0,
      1, 1, 2)],
    [20, new Array<number>(
      2, 1, 0,
      0, 1, 1,
      2, 1, 0)],

    [21, new Array<number>(
      0, 1, 2,
      1, 1, 0,
      0, 1, 2)],

    [22, new Array<number>(
      1, 1, 0,
      1, 1, 1,
      1, 1, 0)],
    [23, new Array<number>(
      0, 1, 1,
      1, 1, 1,
      0, 1, 1)],
    //Row 5
    [24, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      1, 1, 0)],
    [25, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      0, 1, 1)],
    [26, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      0, 1, 0)],

    [27, new Array<number>(
      2, 1, 0,
      0, 1, 1,
      2, 0, 2)],

    [28, new Array<number>(
      0, 1, 2,
      1, 1, 0,
      2, 0, 2)],

    [29, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      2, 0, 2)],


    //Rpw 6
    [30, new Array<number>(
      2, 0, 2,
      0, 1, 1,
      2, 1, 0)],
    [31, new Array<number>(
      2, 0, 2,
      1, 1, 0,
      0, 1, 2)],

    [32, new Array<number>(
      0, 1, 0,
      1, 1, 1,
      0, 1, 0)],
    [33, new Array<number>(
      2, 1, 1,
      0, 1, 1,
      2, 1, 0)],
    [34, new Array<number>(
      1, 1, 2,
      1, 1, 0,
      0, 1, 2)],
    [35, new Array<number>(
      0, 1, 0,
      1, 1, 1,
      2, 0, 2)],

    //rOW 7
    [36, new Array<number>(
      0, 1, 0,
      1, 1, 1,
      1, 1, 0)],
    [37, new Array<number>(
      0, 1, 0,
      1, 1, 1,
      0, 1, 1)],
    [38, new Array<number>(
      0, 1, 1,
      1, 1, 1,
      2, 0, 2)],

    [39, new Array<number>(
      1, 1, 0,
      1, 1, 1,
      2, 0, 2)],
    [40, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      1, 1, 0)],
    [41, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      0, 1, 1)],
    //Row 8
    [42, new Array<number>(
      1, 1, 0,
      1, 1, 1,
      0, 1, 0)],
    [43, new Array<number>(
      0, 1, 1,
      1, 1, 1,
      0, 1, 0)],
    [44, new Array<number>(
      0, 1, 0,
      1, 1, 1,
      1, 1, 1)],
    [49, new Array<number>(
      0, 1, 2,
      1, 1, 1,
      2, 1, 0)],
    [48, new Array<number>(
      2, 1, 0,
      1, 1, 1,
      0, 1, 2)],

  ]);

  private TilePatterns3x3Block_n = MultiMap.construct<number, Array<number>>([
    [0, new Array<number>(
      0, 0, 0,
      0, 1, 1,
      0, 1, 1)],
    [1, new Array<number>(
      0, 0, 0,
      1, 1, 1,
      1, 1, 1)],
    [2, new Array<number>(
      0, 0, 0,
      1, 1, 0,
      1, 1, 0)],
    [3, new Array<number>(
      0, 1, 1,
      0, 1, 1,
      0, 1, 1)],
    [4, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      1, 1, 1)],
    [5, new Array<number>(
      1, 1, 0,
      1, 1, 0,
      1, 1, 0)],
    [6, new Array<number>(
      0, 1, 1,
      0, 1, 1,
      0, 0, 0)],
    [7, new Array<number>(
      1, 1, 1,
      1, 1, 1,
      0, 0, 0)],
    [8, new Array<number>(
      1, 1, 0,
      1, 1, 0,
      0, 0, 0)],
  ]);

  private TilePatternsFence_n = MultiMap.construct<number, Array<number>>([
    [0, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 0, 2)],
    [1, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 1, 2)],
    [2, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      0, 1, 0)],
    [3, new Array<number>(
      2, 0, 0,
      0, 1, 1,
      0, 1, 2)],
    [4, new Array<number>(
      0, 0, 2,
      1, 1, 0,
      2, 1, 0)],
    [5, new Array<number>(
      2, 0, 0,
      0, 1, 1,
      2, 0, 0)],
    [6, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      2, 0, 2)],
    [7, new Array<number>(
      0, 0, 2,
      1, 1, 0,
      0, 0, 2)],
    [8, new Array<number>(
      0, 1, 2,
      0, 1, 1,
      2, 0, 0)],
    [9, new Array<number>(
      2, 1, 0,
      1, 1, 0,
      0, 0, 2)],
    [10, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      2, 0, 2)],
    [11, new Array<number>(
      2, 1, 2,
      1, 1, 1,
      2, 1, 2)],
  ]);

  private TilePatternsHardBorder_n = MultiMap.construct<number, Array<number>>([
    [0, new Array<number>(
      2, 0, 2,
      0, 1, 1,
      2, 1, 2)],
    [1, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      2, 1, 2)],
    [2, new Array<number>(
      2, 0, 2,
      1, 1, 0,
      2, 1, 2)],
    [3, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      2, 0, 2)],
    [4, new Array<number>(
      2, 1, 2,
      0, 1, 1,
      2, 1, 2)],
    //**IGNORE pattern 5 (blank)
    [5, new Array<number>(
      0, 0, 0,
      0, 0, 0,
      0, 0, 0)],
    [6, new Array<number>(
      2, 1, 2,
      1, 1, 0,
      2, 1, 2)],
    [7, new Array<number>(
      2, 0, 2,
      0, 1, 0,
      2, 1, 2)],
    [8, new Array<number>(
      2, 1, 2,
      0, 1, 1,
      2, 0, 2)],
    [9, new Array<number>(
      2, 1, 2,
      1, 1, 1,
      2, 0, 2)],
    [10, new Array<number>(
      2, 1, 2,
      1, 1, 0,
      2, 0, 2)],
    [11, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 1, 2)],
    [12, new Array<number>(
      2, 0, 2,
      0, 1, 1,
      2, 0, 2)],
    [13, new Array<number>(
      2, 0, 2,
      1, 1, 1,
      2, 0, 2)],
    [14, new Array<number>(
      2, 0, 2,
      1, 1, 0,
      2, 0, 2)],
    [15, new Array<number>(
      2, 1, 2,
      0, 1, 0,
      2, 0, 2)],
    //Start of corners
    [16, new Array<number>(
      0, 1, 2,
      1, 1, 1,
      2, 1, 2)],
    [17, new Array<number>(
      2, 1, 0,
      1, 1, 1,
      2, 1, 2)],
    [18, new Array<number>(
      2, 1, 2,
      1, 1, 1,
      2, 1, 0)],
    [19, new Array<number>(
      2, 1, 2,
      1, 1, 1,
      0, 1, 2)],
  ]);

}