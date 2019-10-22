import * as THREE from 'three';
import {
  Vector3, Vector2, Vector4, Color, ShapeUtils, Mesh, PerspectiveCamera, Box3, Geometry, Scene, Matrix4, Matrix3, Object3D,
  AlwaysStencilFunc, MeshStandardMaterial, MeshBasicMaterial, RGBA_ASTC_10x5_Format, Material, MeshPhongMaterial, BufferAttribute, Quaternion, ObjectSpaceNormalMap, Float32Attribute, NormalBlending, WrapAroundEnding, InvertStencilOp
} from 'three';
import { Globals, GameState } from './Globals';
import { basename } from 'upath';
import { Utils } from './Utils';
import { Random, ModelManager, AfterLoadFunction, Frustum } from './Base';
import { vec2, vec3, vec4, mat3, mat4, ProjectedRay, Box2f, RaycastHit, ivec2 } from './Math';
import * as Files from './Files';
import { Int, roundToInt, toInt, checkIsInt, assertAsInt } from './Int';
import { TileGrid, MasterMap, Cell, TileBlock, TiledSpriteId, TileLayer } from './TileGrid';
import { PhysicsObject3D } from 'Physics3D';

export class ImageResource {
  private _location: string = "";
  public get Location(): string { return this._location; }
  //[Jsonignore]
  public Texture: THREE.Texture = null;
  public Name: string = "";
  public Id: number = -1;

  public load(loc: string, afterLoad: AfterLoadFunction) {
    this._location = loc;

    let that = this;
    //THREE.ImageUtils.loadTexture(loc), transparent: true, opacity: 0.5, color: 0xFF0000 }))
    this.Texture = new THREE.TextureLoader().load(loc, function (tex) {
      if (afterLoad) {
        afterLoad(that);
      }
    });
    this.Texture.magFilter = THREE.NearestFilter;
    this.Texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.Texture.generateMipmaps = true;
  }
}
export class Atlas extends ImageResource {
  /*
  This is the sprite sheet.

  So, once Monogame Toolkit is finished the textrue coords will be loaded manually from a packed texture.
  for now, we;re just using straight tiled textures.
  */
  private _topPad: Int = 1 as Int;
  private _leftPad: Int = 1 as Int;
  private _rightPad: Int = 1 as Int;
  private _botPad: Int = 1 as Int;

  private _xSpace: Int = 1 as Int;  //Pixel Space between frames.
  private _ySpace: Int = 1 as Int;

  private _tileWidthPixels: Int = 16 as Int;
  private _tileHeightPixels: Int = 16 as Int;

  private static _tileWidthR3: number = 1;
  private static _tileHeightR3: number = 1;
  public static get TileWidthR3() { return this._tileWidthR3; }
  public static get TileHeightR3() { return this._tileHeightR3; }

  //Number of frames across the atlas.
  public get FramesWidth(): Int {
    return ((this.ImageWidth - this.RightPad - this.LeftPad + this.SpaceX) / (this.TileWidthPixels + this.SpaceX)) as Int;
  }
  public get FramesHeight(): Int {
    return ((this.ImageHeight - this.BotPad - this.TopPad + this.SpaceY) / (this.TileHeightPixels + this.SpaceY)) as Int;
  }

  public get ImageWidth(): Int {
    let w = this.Texture.image.width;
    return w;
  }
  public get ImageHeight(): Int {
    let h = this.Texture.image.height;
    return h;
  }

  public get TopPad(): Int { return this._topPad; }
  public get LeftPad(): Int { return this._leftPad; }
  public get RightPad(): Int { return this._rightPad; }
  public get BotPad(): Int { return this._botPad; }
  public get SpaceX(): Int { return this._xSpace; }
  public get SpaceY(): Int { return this._ySpace; }
  public get TileWidthPixels(): Int { return this._tileWidthPixels; }
  public get TileHeightPixels(): Int { return this._tileHeightPixels; }

  public constructor(top: Int, left: Int, right: Int, bot: Int, xSpace: Int, ySpace: Int, tile_w: Int, tile_h: Int, tex: string, afterLoad: AfterLoadFunction) {
    super();
    this._topPad = top;
    this._leftPad = left;
    this._rightPad = right;
    this._botPad = bot;

    this._xSpace = xSpace;
    this._ySpace = ySpace;

    this._tileWidthPixels = tile_w;
    this._tileHeightPixels = tile_h;

    this.load(tex, afterLoad);
  }
}
export class SpriteFrame {
  //A sub-image of a texture.
  //Technically we should allow multiple textures and batching, but for now, just one texture.
  public debug_tile_x: number = 0;  //The Tile X/Y.  This is for information purposes only and may not actually be usd.
  public debug_tile_y: number = 0;
  public x: number = 0; //Texture X/Y (NOT tile index)
  public y: number = 0;
  public w: number = 0;
  public h: number = 0;
  public shrink(amt: number) {
    //Add a slight margin to this frame in order to prevent small amounts of texture error.  Works well for pixel level textures with nearest filtering.
    this.x += amt;
    this.y += amt;
    this.w -= amt * 2;
    this.h -= amt * 2;
  }
  public static fromAtlasTile(atlas: Atlas, tx: Int, ty: Int, margin: number = 0.0004): SpriteFrame {
    //Margin will shrink or grow the image to reduce texel border artifacts
    let sw: number = Number(atlas.TileWidthPixels) / Number(atlas.ImageWidth);
    let sh: number = Number(atlas.TileHeightPixels) / Number(atlas.ImageHeight);
    let f: SpriteFrame = new SpriteFrame();
    f.x = (Number(atlas.LeftPad) + tx * Number(atlas.TileWidthPixels + atlas.SpaceX)) / Number(atlas.ImageWidth);
    //Tex is in gl coords from bot left corner. so 0,0 is actually 0,h-1
    f.y = 1 - (Number(atlas.TopPad) + ty * Number(atlas.TileHeightPixels + atlas.SpaceY)) / Number(atlas.ImageHeight) - sh;
    f.w = sw;
    f.h = sh;
    f.debug_tile_x = tx;
    f.debug_tile_y = ty;

    if (margin !== 0) {
      f.shrink(margin);
    }

    return f;
  }
  public static createQuadVerts(verts: Array<vec3> /*out*/, origin: vec3, width: number, height: number, layer: Int, layerDepth: number = 0.01, scale: vec2 = new vec2(1, 1)) {
    //Returns verts filled with the 4 quad vertexes
    let right: vec3 = WorldView25D.Right;
    let down: vec3 = WorldView25D.Down;
    let normal: vec3 = WorldView25D.Normal;

    //Position the image relative to the world grid's basis
    let tilepos_local: vec3 = right.clone().multiplyScalar(origin.x);
    tilepos_local.add(down.clone().multiplyScalar(origin.y /** -1*/ /*NOTE: we are multiplying by -1 here */));
    tilepos_local.add(normal.clone().multiplyScalar(origin.z + (layerDepth * (layer as number))));

    if (layer === TileLayer.Unset) {
      Globals.logWarn("Tile layer was unset.");
    }


    if (verts.length !== 4) {
      while (verts.length < 4) {
        verts.push(new vec3());
      }
    }

    verts[0] = tilepos_local;
    verts[1] = verts[0].clone().add(right.clone().multiplyScalar(width * scale.x));
    verts[2] = verts[0].clone().add(down.clone().multiplyScalar(height * scale.y));
    verts[3] = verts[2].clone().add(right.clone().multiplyScalar(width * scale.x));

  }
}
export class FDef {
  //Quick Sprite Keyframe Definition
  p: ivec2 = null;
  h: boolean = false;
  v: boolean = false;
  c: vec4 = null;
  image_interpolation: SpriteKeyFrameInterpolation = SpriteKeyFrameInterpolation.Step;

  public static default(framexys: Array<Array<number>>): Array<FDef> {
    let ret: Array<FDef> = new Array<FDef>();

    for (let xi = 0; xi < framexys.length; xi++) {
      if (framexys[xi].length !== 2) {
        Globals.logError("Inavlid frame xy numbers in FDef.default");
        Globals.debugBreak();
      }
      let ix: Int = framexys[xi][0] as Int;
      let iy: Int = framexys[xi][1] as Int;
      let d = new FDef(new ivec2(ix, iy), false, false, new vec4(1, 1, 1, 1), SpriteKeyFrameInterpolation.Step);
      ret.push(d);
    }
    return ret;
  }

  public constructor(dp: ivec2 = null, dh: boolean = null, dv: boolean = null, dc: vec4 = null, ii: SpriteKeyFrameInterpolation = null) {
    this.p = dp;
    this.h = dh;
    this.v = dv;
    this.c = dc;
    this.image_interpolation = ii;
  }
  public clone(): FDef {
    let f: FDef = new FDef();
    f.copy(this);
    return f;
  }
  public copy(other: FDef) {
    this.p = other.p ? other.p.clone() : null;
    this.h = other.h;
    this.v = other.v;
    this.c = other.c ? other.c.clone() : null;
    this.image_interpolation = other.image_interpolation;
  }
}
export enum SpriteKeyFrameInterpolation { Linear, Step }
export class SpriteKeyFrame {
  //Keyframe for animation
  public _parent: SpriteAnimationData = null;//MUST SET
  public _frame: SpriteFrame = null; //The frame the sprite gets set to
  public _position: vec3 = new vec3(0, 0);
  public _rotation: Quaternion = new Quaternion(1, 0, 0, 0); //Axis/angle rotation
  public _scale: vec2 = new vec2(1, 1);
  public _visible: boolean = true;
  public _color: vec4 = new vec4(1, 1, 1, 1);
  public _duration: number = 0;
  public _transformInterpolation: SpriteKeyFrameInterpolation = SpriteKeyFrameInterpolation.Linear;
  public _imageInterpolation: SpriteKeyFrameInterpolation = SpriteKeyFrameInterpolation.Step;
  public _colorInterpolation: SpriteKeyFrameInterpolation = SpriteKeyFrameInterpolation.Linear;
  public _flipH: boolean = false;
  public _flipV: boolean = false;

  public get FlipH(): boolean { return this._flipH; }
  public set FlipH(x: boolean) { this._flipH = x; }
  public get FlipV(): boolean { return this._flipV; }
  public set FlipV(x: boolean) { this._flipV = x; }
  public get TransformInterpolation(): number { return this._transformInterpolation; }
  public set TransformInterpolation(x: number) { this._transformInterpolation = x; }
  public get ImageInterpolation(): number { return this._imageInterpolation; }
  public set ImageInterpolation(x: number) { this._imageInterpolation = x; }
  public get ColorInterpolation(): number { return this._colorInterpolation; }
  public set ColorInterpolation(x: number) { this._colorInterpolation = x; }
  public get Duration(): number { return this._duration; }
  public set Duration(x: number) { this._duration = x; }
  public get Frame(): SpriteFrame { return this._frame; }
  public set Frame(x: SpriteFrame) { this._frame = x; }
  public get Position(): vec3 { return this._position; } //Relative to the sprite origin
  public set Position(x: vec3) { this._position = x; } //Relative to the sprite origin
  public get Rotation(): Quaternion { return this._rotation; } //Relative to the sprite origin
  public set Rotation(x: Quaternion) { this._rotation = x; } //Relative to the sprite origin
  public get Scale(): vec2 { return this._scale; } //Relative to the sprite origin
  public set Scale(x: vec2) { this._scale = x; } //Relative to the sprite origin
  public get Color(): vec4 { return this._color; } //Relative to the sprite origin
  public set Color(x: vec4) { this._color = x; } //Relative to the sprite origin
  public get Parent(): SpriteAnimationData { return this._parent; }

  public constructor(parent: SpriteAnimationData) {
    this._parent = parent;
  }
}
export class SpriteAnimationData {
  //Animation sequence for a single sprite component.
  private _name: string = "";
  private _lstKeyFrames: Array<SpriteKeyFrame> = new Array<SpriteKeyFrame>();

  private _duration: number = 0;

  public get Duration(): number { return this._duration; }
  public get Name(): string { return this._name; }
  public get KeyFrames(): Array<SpriteKeyFrame> { return this._lstKeyFrames; }
  public set KeyFrames(x: Array<SpriteKeyFrame>) { this._lstKeyFrames = x; }

  public calcDuration() {
    this._duration = 0;
    for (let kf of this._lstKeyFrames) {
      this._duration += kf.Duration;
    }
  }

  public constructor(name: string) {
    this._name = name;
  }
}
export enum AnimationPlayback { Playing, Pauseed, Stopped }
class Animation25D {
  //Separate class to deal with animations and transitinos.  Just because Sprite25D was getting big.

  private _animated_location: vec3 = new vec3(0, 0, 0); // Animated attributes.  These are applied if there is animation on the object.
  private _animated_rotation: Quaternion = new Quaternion(0, 0, 0, 0);
  private _animated_scale: vec2 = new vec2(1, 1);

  private _frame: SpriteFrame = null;
  private _frame2: SpriteFrame = null; //Second frame to blend to.
  private _frameBlend: number = 0; // blend amount for the given frame.

  private _loop: boolean = true;
  private _animations: Map<string, SpriteAnimationData> = new Map<string, SpriteAnimationData>();//Shared -> Map of animation name to the data.
  private _currentAnimation: SpriteAnimationData = null;
  private _animationTime: number = 0;
  private _animationSpeed: number = 1;//multiplier
  private _playback: AnimationPlayback = AnimationPlayback.Stopped;

  private _sprite: Sprite25D = null;

  //Tileblock Data - static tile data used by background sprites & such.
  private _tileData: SpriteAnimationData = null;

  public isStaticTile() { return this.TileData !== null; }
  public get TileData(): SpriteAnimationData { return this._tileData; }

  public get Playback(): AnimationPlayback { return this._playback; }

  public get Sprite(): Sprite25D { return this._sprite; }
  public get AnimationTime(): number { return this._animationTime; }
  public set AnimationTime(x: number) { this._animationTime = x; }
  public get AnimationSpeed(): number { return this._animationSpeed; }
  public set AnimationSpeed(x: number) { this._animationSpeed = x; }
  public get Animations(): Map<string, SpriteAnimationData> { return this._animations; }
  public get Loop(): boolean { return this._loop; }

  //Tile versions are animated positions.  Not the position of this object.
  public get AnimatedPosition(): vec3 { return this._animated_location; }
  public set AnimatedPosition(x: vec3) { this._animated_location = x; }
  public get AnimatedRotation(): Quaternion { return this._animated_rotation; }
  public set AnimatedRotation(x: Quaternion) { this._animated_rotation = x; }
  public get AnimatedScale(): vec2 { return this._animated_scale; }
  public set AnimatedScale(x: vec2) { this._animated_scale = x; }
  public get CurrentAnimation(): SpriteAnimationData { return this._currentAnimation; }

  public get Frame(): SpriteFrame { return this._frame; }
  public set Frame(x: SpriteFrame) {
    if (this._frame !== x) {
      this.Sprite.markDirty(DirtyFlag.UVs);
    }
    this._frame = x;
  }
  public get Frame2(): SpriteFrame { return this._frame2; }
  public set Frame2(x: SpriteFrame) {
    if (this._frame2 !== x) {
      this.Sprite.markDirty(DirtyFlag.UVs);
    }
    this._frame2 = x;
  }
  public get FrameBlend(): number { return this._frameBlend; }
  public set FrameBlend(x: number) { this._frameBlend = x; }

  public constructor(sprite: Sprite25D) {
    this._sprite = sprite;
  }
  public copy(other: Animation25D) {

    this._loop = other._loop;
    this._animations = other._animations; // this is a shallow copy.  Animation data is shared.
    this._currentAnimation = other._currentAnimation;
    this._animationTime = other._animationTime;
    this._animationSpeed = other._animationSpeed;
    this._playback = other._playback;

    this._frame = other._frame;
    this._frame2 = other._frame2;
    this._frameBlend = other._frameBlend;

    this._sprite = other._sprite;
    this._tileData = other._tileData; // shallow copy
  }
  public clone(parent: Sprite25D): Animation25D {
    let ret: Animation25D = new Animation25D(parent);
    ret.copy(this);
    return ret;
  }

  public update(dt: number) {
    //Update Animation
    if (this.Playback === AnimationPlayback.Playing) {
      let anim = this._currentAnimation;

      if (anim) {
        if (anim.KeyFrames.length > 0) {
          this._animationTime += dt * this._animationSpeed;

          let ob = this.getFrames(anim);
          let kflen = this._currentAnimation.KeyFrames.length;
          if (ob.frameA >= 0 &&
            ob.frameA < kflen &&
            ob.frameB >= 0 &&
            ob.frameB < kflen) {

            let keyA = anim.KeyFrames[ob.frameA];
            let keyB = anim.KeyFrames[ob.frameB];
            this.interpolateKeyFrames(keyA, keyB, ob.t01);
          }
          else {
            Globals.logError("Animation keyframes out of bounds: " + anim.Name);
          }

        }//anim.keyframes.length > 0
      }//if(anim)
    }
  }
  private getFrames(anim: SpriteAnimationData): any {
    //Return value is an object.
    let ob: any = { frameA: -1, frameB: -1, t01: 0.0 };

    let total_time: number = 0;

    //Get frame a and b to interpolate
    for (let ki = 0; ki < anim.KeyFrames.length; ++ki) {
      let key = anim.KeyFrames[ki];
      let next_time = total_time + key.Duration;

      if (this._animationTime < next_time) {
        ob.frameA = ki;
        ob.t01 = (this._animationTime - total_time) / (next_time - total_time)
        break;
      }
      total_time += key.Duration;
    }

    if (ob.frameA === -1) {
      if (this._loop) {
        ob.frameA = 0;
        this._animationTime = 0;
      }
      else {
        ob.frameA = anim.KeyFrames.length - 1;
        this._animationTime = anim.Duration;
      }
    }

    ob.frameB = ob.frameA + 1;
    if (ob.frameB >= anim.KeyFrames.length) {
      if (this._loop) {
        ob.frameB = 0;
      }
      else {
        ob.frameB = ob.frameA;
      }
    }

    return ob;
  }
  private interpolateKeyFrames(keyA: SpriteKeyFrame, keyB: SpriteKeyFrame, t01: number) {
    //KeyB can be null, in which case we just set the keyframe to be frame A and we ignore t01

    let p: vec3 = null;
    let r: Quaternion = null;
    let s: vec2 = null;
    let c: vec4 = null;

    if (keyB === null) {
      p = keyA.Position.clone();
      s = keyA.Scale.clone();
      r = keyA.Rotation.clone();
      c = keyA.Color.clone();
    }
    else {
      if (keyB.TransformInterpolation === SpriteKeyFrameInterpolation.Linear) {
        p = keyA.Position.clone().lerp(keyB.Position, t01);
        s = keyA.Scale.clone().lerp(keyB.Scale, t01);
        r = keyA.Rotation.clone().slerp(keyB.Rotation, t01);
      }
      else if (keyB.TransformInterpolation === SpriteKeyFrameInterpolation.Step) {
        p = keyA.Position.clone();
        s = keyA.Scale.clone();
        r = keyA.Rotation.clone();
      }

      if (keyB.ColorInterpolation === SpriteKeyFrameInterpolation.Linear) {
        c = keyA.Color.clone().lerp(keyB.Color, t01);
      }
      else if (keyB.ColorInterpolation === SpriteKeyFrameInterpolation.Step) {
        c = keyA.Color.clone();
      }
    }

    if (this.Sprite.Parent) {
      p.add(this.Sprite.Parent.Position);
      s.multiply(this.Sprite.Parent.Scale);
      r.multiply(this.Sprite.Parent.Rotation);
      c.x *= this.Sprite.Parent.Color.x; // Apply parent color
      c.y *= this.Sprite.Parent.Color.y;
      c.z *= this.Sprite.Parent.Color.z;
      c.w *= this.Sprite.Parent.Color.w;
    }

    this.AnimatedPosition = p;
    this.AnimatedScale = s;
    this.AnimatedRotation = r;
    this.Sprite.Color = c;
    this.Sprite.FlipH = keyA.FlipH;
    this.Sprite.FlipV = keyA.FlipV;

    //TODO: blended image interpolation
    if (keyB && keyB.ImageInterpolation === SpriteKeyFrameInterpolation.Linear) {
      this.Frame = keyA.Frame;
      this.Frame2 = keyB.Frame;
      this.FrameBlend = t01;
    }
    else {
      this.Frame = keyA.Frame;
      this.Frame2 = null;
      this.FrameBlend = 0;
    }
  }

  public setKeyFrame(frameIndex: number, anim: SpriteAnimationData = null, recursive: boolean = true) {
    let my_anim = anim;
    if (my_anim === null) {
      my_anim = this._currentAnimation;
    }
    //Sets the given keyframe data for the character.
    if (my_anim) {
      if (my_anim.KeyFrames.length > frameIndex) {
        let key = my_anim.KeyFrames[frameIndex];
        this.interpolateKeyFrames(key, null, 0);
      }
      else {
        Globals.logError("Tried to set invalid keyframe for obj " + this.Sprite.Name + " index : " + frameIndex);
      }
    }

    if (recursive) {
      for (const c of this.Sprite.Children) {
        c.Animation.setKeyFrame(frameIndex, anim, recursive);
      }
    }

  }
  public pause() {
    this._playback = AnimationPlayback.Stopped;
    for (const c of this.Sprite.Children) {
      c.Animation.pause();
    }
  }
  public play(animation_name: string = null, restart: boolean = true) {
    //if PreventRestart is true, then skip setting a new animation if the same animation is already playing.
    if (animation_name === null) {
      if (this._currentAnimation) {
        this._playback = AnimationPlayback.Stopped;
      }
      this._currentAnimation = null;
    }
    else if ((this.CurrentAnimation !== null) && (this.CurrentAnimation.Name === animation_name) && !restart) {
      //Do not play new animation.  It's already playing and we dont' want to interrupt.
      this._playback = AnimationPlayback.Playing;
    }
    else {
      let d = this._animations.get(animation_name);
      if (d) {
        this._currentAnimation = d;
        this._playback = AnimationPlayback.Playing;
      }
      else {
        //not found.
      }
    }

    for (const c of this.Sprite.Children) {
      c.Animation.play(animation_name);
    }
  }

  public addTileFrame(tile: ivec2, atlas: Atlas, imageSize: ivec2 = new ivec2(1, 1)) {
    //For background tiles and tile sets, we have a separate animation data that holds a list of static frames.
    this.addMultiTileAnimation("_default", FDef.default([[tile.x, tile.y]]), 0, atlas, imageSize, true, true);
  }

  public addMultiTileAnimation(animation_name: string, frames: Array<FDef>, duration: number, atlas: Atlas, imageSize: ivec2 = null, append: boolean = false, isTileFrame: boolean = false) {
    //This sets 'real' frame-by-frame animation for a multiple tiled sprite, OR can be used to set static tiled animations.
    //if Append is true, we append the given FDef keys to the input animation
    //Frames should reference from the top left corner (root) of the animated image.
    for (let jtile = 0; jtile < imageSize.y; ++jtile) {
      for (let itile = 0; itile < imageSize.x; ++itile) {

        if (itile === 0 && jtile === 0) {
          this.Sprite.SubTile = new vec2(itile, jtile);
          //Root tile is tile 0,0
          //Add the animation to THIS sprite.
          this.addAnimation(animation_name, frames, duration, atlas, append, isTileFrame);
        }
        else {
          //Get the given sub-tile sprite, or create and add it to this sprite.
          let sp: Sprite25D = this.Sprite.getSubTile(itile, jtile);
          if (sp === null) {
            sp = new Sprite25D();
            sp.Layer = this.Sprite.Layer;
            sp.SubTile = new vec2(itile, jtile);
            this.Sprite.add(sp);
          }

          sp.Animation.addAnimation(animation_name, frames, duration, atlas, append, isTileFrame);
          sp.Position.set(
            this.Sprite.Position.x + itile * this.Sprite.Size.x,
            this.Sprite.Position.y + jtile * this.Sprite.Size.y,
            this.Sprite.Position.z);
        }

      }
    }
  }
  private addAnimation(animation_name: string, frames: Array<FDef>, duration: number, atlas: Atlas, append: boolean = false, isTileFrame: boolean = false): SpriteAnimationData {
    //if Append is true, we append the given FDef keys to the input animation
    let ret: SpriteAnimationData = null;

    if (isTileFrame) {
      //We are static tileframe frame(s)
      if (this._tileData === null) {
        this._tileData = new SpriteAnimationData(animation_name);
      }
      ret = this._tileData;
    }
    else {
      ret = this.Animations.get(animation_name);
      if (ret) {
        if (append === false) {
          Globals.logError("Tried to add another animation " + animation_name + " -- already added.");
          Globals.debugBreak();
          return;
        }
        else {
          //Do nothign, we got it
        }
      }
      else {
        ret = new SpriteAnimationData(animation_name);
      }
    }

    //If we are a sub-tile animation, then add the parent sprite's sub-tile coordinates to the input animation.
    let sub_x = 0;
    let sub_y = 0;
    if (this.Sprite.SubTile) {
      sub_x = this.Sprite.SubTile.x;
      sub_y = this.Sprite.SubTile.y;
    }

    //Create Tiles.

    for (let iframe = 0; iframe < frames.length; ++iframe) {
      let def: FDef = frames[iframe];

      let kf = new SpriteKeyFrame(ret);

      kf.Frame = SpriteFrame.fromAtlasTile(atlas, (def.p.x + sub_x) as Int, (def.p.y + sub_y) as Int);

      kf.Color = def.c ? def.c : new vec4(1, 1, 1, 1);// Random.randomVec4(0, 1);
      kf.FlipH = def.h ? def.h : false;
      kf.FlipV = def.v ? def.v : false;

      kf.ImageInterpolation = def.image_interpolation;

      if (isTileFrame) {
        kf.Duration = 9999999;
      }
      else {
        kf.Duration = duration / frames.length;
      }

      ret.KeyFrames.push(kf);
    }

    if (isTileFrame) {
    }
    else {
      this.Animations.set(animation_name, ret);
    }

    ret.calcDuration();

    return ret;
  }
}
export enum DirtyFlag { /*Transform = 0x01,*/ UVs = 0x02, Normals = 0x04, Colors = 0x08, All = 0x01 | 0x02 | 0x04 | 0x08 }
export class Sprite25D {
  private _subTile: vec2 = null; //If set, this tile is a collection of other subtiles.

  private static _idGen = 1; // Do not clone
  private _tiledSpriteId: TiledSpriteId = TiledSpriteId.None;
  private _name: string = "";
  private _uniqueId: number = 0;// DO NOT CLONE
  private _worldView: WorldView25D = null; // Do not clone
  private _dirty: boolean = false;// Do not clone MUST default to false.  
  private _destroyed: boolean = false; // Do not clone

  private _location: vec3 = new vec3(0, 0, 0); // Location of the object (relative to parent or scene).  This is not animated.
  private _rotation: Quaternion = new Quaternion(0, 0, 0, 0);
  private _scale: vec2 = new vec2(1, 1);

  private _size: vec2 = new vec2(Atlas.TileWidthR3, Atlas.TileHeightR3); // this is actual size of rendered geometry.  This is initially set by Atlas.TileWidthR3
  private _origin: vec3 = new vec3(0, 0, 0);
  private _children: Array<Sprite25D> = new Array<Sprite25D>();
  private _parent: Sprite25D = null; // Do not clone
  private _visible: boolean = true;
  private _dirtyFlags: number = 0 | 0; // Do not clone

  private _color: vec4 = new vec4(1, 1, 1, 1);
  public _flipH: boolean = false;
  public _flipV: boolean = false;
  public _animation: Animation25D = null;


  private _boundBox: Box2f = new Box2f();// The animated bounds of the sprite.

  private _quadVerts: Array<vec3> = new Array<vec3>(4);  //Quad Verts - do not clone
  private _quadNormal: vec3 = new vec3(0, 0, 1); // do not clone

  private _isCellTile: boolean = false;

  public _layer: TileLayer = TileLayer.Unset;

  public get Layer(): TileLayer { return this._layer; }
  public set Layer(x: TileLayer) { this._layer = x; }

  public get IsCellTile(): boolean { return this._isCellTile; }
  public set IsCellTile(x: boolean) { this._isCellTile = x; }

  public get BoundBox(): Box2f { return this._boundBox; }
  public get TiledSpriteId(): TiledSpriteId { return this._tiledSpriteId; }

  public get QuadVerts(): Array<vec3> { return this._quadVerts; }
  public get QuadNormal(): vec3 { return this._quadNormal; }
  public set QuadNormal(x: vec3) { this._quadNormal = x; this.markDirty(DirtyFlag.Normals); }

  public get Animation(): Animation25D { return this._animation; }

  public get Name(): string { return this._name; }
  public set Name(x: string) { this._name = x; }

  //SubTile is used to make multi-tile animations.  In addTiledAnimation the subtile adds an x/y offset to the animation.
  //The sub-tile is a tile relative to a "root" Sprite of 0,0 and adds the keyframe offsets to this location.  
  //This is for multi-tiled sprite animations, for example a character that is 2 tiles high (ex. pokemon char sprite)
  public get SubTile(): vec2 { return this._subTile; }
  public set SubTile(x: vec2) { this._subTile = x; }

  public get Color(): vec4 { return this._color; }
  public set Color(x: vec4) { this._color = x; this.markDirty(DirtyFlag.Colors); }
  public get FlipH(): boolean { return this._flipH; }
  public set FlipH(x: boolean) { this._flipH = x; }
  public get FlipV(): boolean { return this._flipV; }
  public set FlipV(x: boolean) { this._flipV = x; }

  public get UniqueId(): number { return this._uniqueId; }
  public get Origin(): vec3 { return this._origin; }
  public get DirtyFlags(): number { return this._dirtyFlags; }
  public get Visible(): boolean { return this._visible; }
  public set Visible(x: boolean) { this._visible = x; }
  public get Parent(): Sprite25D { return this._parent; }
  public get Children(): Array<Sprite25D> { return this._children; }
  public get WorldView(): WorldView25D { return this._worldView; }
  public set WorldView(x: WorldView25D) { this._worldView = x; }

  public get Dirty(): boolean { return this._dirty; }

  public get Destroyed(): boolean { return this._destroyed; }
  public set Destroyed(x: boolean) { this._destroyed = x; }

  public get Position(): vec3 { return this._location; }
  public set Position(x: vec3) { this._location = x; }
  public get Rotation(): Quaternion { return this._rotation; }
  public set Rotation(x: Quaternion) { this._rotation = x; }
  public get Scale(): vec2 { return this._scale; }
  public set Scale(x: vec2) { this._scale = x; }

  public get Size(): vec2 { return this._size; }
  public set Size(x: vec2) { this._size = x; }
  public get Width(): number { return this._size.x; }
  public set Width(x: number) { this._size.x = x; }
  public get Height(): number { return this._size.y; }
  public set Height(x: number) { this._size.y = x; }

  private _debugBox: THREE.Box3Helper = null;

  public constructor(name: string = null, spriteId: TiledSpriteId = TiledSpriteId.None, layer: TileLayer = null) {
    if (name) {
      this._name = name;
    }
    if (layer) {
      this._layer = layer;
    }
    this._tiledSpriteId = spriteId;

    this._uniqueId = Sprite25D._idGen++;
    this._animation = new Animation25D(this);

  }

  public copy(other: Sprite25D) {
    //We do not clone every member, see comments above.
    this._subTile = other._subTile.clone();

    this._location = other._location.clone();
    this._rotation = other._rotation.clone();
    this._scale = other._scale.clone();
    this._size = other._size.clone();
    this._origin = other._origin.clone();

    for (let ci = 0; ci < other._children.length; ci++) {
      this._children.push(other._children[ci].clone());
    }
    this._visible = other._visible;

    this._color = other._color;
    this._flipH = other._flipH;
    this._flipV = other._flipV;
    this._animation = other._animation.clone(this);

    this._boundBox = other._boundBox.clone();
    this._tiledSpriteId = other._tiledSpriteId;
    this._isCellTile = other._isCellTile;

    this._layer = other._layer;
  }
  public clone(): Sprite25D {
    let ret = new Sprite25D();
    ret.copy(this);
    return ret;
  }
  public update(dt: number, box: Box2f = null) {
    this.Animation.update(dt);

    if (box === null) {
      box = this._boundBox;
      box.GenResetExtents();
    }

    //Update Boundbox.
    this.updateQuadVerts();
    for (let v of this.QuadVerts) {
      box.ExpandByPoint(new vec2(v.x, v.y));
    }

    //Update Children
    for (let ci = 0; ci < this._children.length; ++ci) {
      this._children[ci].update(dt, box);
    }

    //Debug Box
    if (Globals.isDebug() && box === this._boundBox) {
      if (this._debugBox !== null) {
        Globals.scene.remove(this._debugBox);
      }
      this._debugBox = new THREE.Box3Helper(new THREE.Box3(
        new vec3(this._boundBox.Min.x, this._boundBox.Min.y, this.Position.z),
        new vec3(this._boundBox.Max.x, this._boundBox.Max.y, this.Position.z)
      ), new Color(1, 0, 0));
      Globals.scene.add(this._debugBox);
    }

  }
  public add(ob: Sprite25D) {
    if (this.findById(ob.UniqueId) !== null) {
      Globals.logError("Tried to add duplicate sprite to hierarchy.");
    }
    else {
      this._children.push(ob);
      ob._parent = this;
    }
  }
  public findById(id: number) {
    let ret: { x: Sprite25D; } = { x: null };
    this.findById_r(id, ret);
    return ret.x;
  }
  private findById_r(id: number, ret: { x: Sprite25D }) {
    if (this.UniqueId === id) {
      ret.x = this;
      return;
    }
    else {
      for (let c of this.Children) {
        c.findById_r(id, ret);
        if (ret.x) {
          break;
        }
      }
    }
  }
  public remove(ob: Sprite25D) {
    for (let i = 0; i < this._children.length; i--) {
      if (this._children[i] === ob) {
        this._children.splice(i, 1);
        ob._parent = null;
        break;
      }
    }
  }
  public destroy() {
    if (this.WorldView) {
      this.WorldView.destroyObject25(this);
      for (let ci = 0; ci < this._children.length; ++ci) {
        this._children[ci].destroy();
      }
    }
  }
  public getSubTile(i: number, j: number): Sprite25D {
    //Returns the SubTile at the given i,j offset
    let ret: { x: Sprite25D; } = { x: null };
    this.getSubTile_r(i, j, ret);
    return ret.x;
  }
  private getSubTile_r(i: number, j: number, ret: { x: Sprite25D }) {
    if (this.SubTile && this.SubTile.x === i && this.SubTile.y === j) {
      ret.x = this;
    }
    else {
      for (let c of this.Children) {
        c.getSubTile_r(i, j, ret);
        if (ret.x) { }
        break;
      }
    }
  }
  public updateQuadVerts() {
    let tile = this;
    //Translate tile with origin.
    let tilepos_translated: vec3 = tile.Position.clone().add(tile.Animation.AnimatedPosition).add(tile.Origin);

    SpriteFrame.createQuadVerts(this.QuadVerts, tilepos_translated, tile.Width, tile.Height, this.Layer as Int, WorldView25D.LayerDepth, tile.Scale.clone().multiply(tile.Animation.AnimatedScale))
  }
  public markDirty(flags: number = DirtyFlag.All) {
    this._dirty = true;
    this._dirtyFlags |= flags;
  }
  public clearDirty() {
    this._dirty = false;
    this._dirtyFlags = 0;
  }

}
export class TileBuffer extends THREE.BufferGeometry {
  private _bufferSizeTiles: number = 0;

  private _vsiz: number = 3;
  private _nsiz: number = 3;
  private _csiz: number = 4;
  private _tsiz: number = 2;

  private _view: WorldView25D = null;

  private _attrPosition: THREE.BufferAttribute;
  private _attrNormal: THREE.BufferAttribute;
  private _attrColor: THREE.BufferAttribute;
  private _attrTexture: THREE.BufferAttribute;

  private _usedBufferLengthTiles = 0;

  private _updFlags: number = 0;

  //Custom shaders
  //https://bl.ocks.org/duhaime/c8375f1c313587ac629e04e0253481f9
  //Updateing buffers
  //https://threejs.org/docs/#manual/en/introduction/How-to-update-things
  public constructor(numtiles: number, view: WorldView25D) {
    super();
    this._view = view;
    this.allocate(numtiles);
  }
  public allocate(numTiles: number) {
    this._bufferSizeTiles = numTiles;

    this.setDrawRange(0, 0);

    let verts: Float32Array = new Float32Array(numTiles * 4 * this._vsiz);
    let norms: Float32Array = new Float32Array(numTiles * 4 * this._nsiz);
    let colors: Float32Array = new Float32Array(numTiles * 4 * this._csiz);
    let texs: Float32Array = new Float32Array(numTiles * 4 * this._tsiz);

    this.fillDefault(verts, texs, norms, colors);

    this._attrPosition = new THREE.BufferAttribute(verts, this._vsiz);
    this._attrNormal = new THREE.BufferAttribute(norms, this._nsiz);
    this._attrColor = new THREE.BufferAttribute(colors, this._csiz);
    this._attrTexture = new THREE.BufferAttribute(texs, this._tsiz);

    this._attrPosition.setDynamic(true);
    this._attrNormal.setDynamic(true);
    this._attrColor.setDynamic(true);
    this._attrTexture.setDynamic(true);

    this.addAttribute('position', this._attrPosition);
    this.addAttribute('normal', this._attrNormal);
    this.addAttribute('color', this._attrColor);
    this.addAttribute('uv', this._attrTexture);

    //Threejs uses CCW default winding https://threejs.org/docs/#api/en/constants/Renderer
    let indexes = new Array<number>/*Int16Array*/(numTiles * 6);
    for (let ii = 0, tt = 0; ii < numTiles * 6; ii += 6) {
      let tvoff = ii / 6 * 4;

      indexes[ii + 0] = tvoff + 0;
      indexes[ii + 1] = tvoff + 2;
      indexes[ii + 2] = tvoff + 1;

      indexes[ii + 3] = tvoff + 1;
      indexes[ii + 4] = tvoff + 2;
      indexes[ii + 5] = tvoff + 3;
    }

    this.setIndex(indexes);
  }
  public beginCopy() {
    this._updFlags = 0;
    this._usedBufferLengthTiles = 0; //reset
  }
  public endCopy() {
    let p: boolean = true; //From now on always update tile transform (since tiles will almost always be needing update)
    let n: boolean = (this._updFlags & DirtyFlag.Normals) > 0;
    let c: boolean = (this._updFlags & DirtyFlag.Colors) > 0;
    let t: boolean = (this._updFlags & DirtyFlag.UVs) > 0;

    this._attrPosition.needsUpdate = p;
    this._attrNormal.needsUpdate = n;
    this._attrColor.needsUpdate = c;
    this._attrTexture.needsUpdate = t;

    this.updateBufferRange();
    this.computeBoundingBox();
    this.computeBoundingSphere();
  }
  private _debugNumCopies = 0;
  public copyObjectTile(tile: Sprite25D) {
    if (tile.Animation.Frame) {
      if (tile.Animation.Frame2 && tile.Animation.FrameBlend > 0.0001) {
        this.copyTileFrame(tile, tile.Animation.Frame, tile.Animation.FrameBlend);
        this.copyTileFrame(tile, tile.Animation.Frame2, 1 - tile.Animation.FrameBlend);
      }
      else {
        this.copyTileFrame(tile, tile.Animation.Frame);
      }
    }
    else {
      //Error.
      Globals.debugBreak();
    }
  }
  public copyCellTile(cell: Cell, tile: Sprite25D, frame: Int) {
    //Copy a static Tile Sprite
    if (tile.Animation.TileData && tile.Animation.TileData.KeyFrames.length > frame) {
      this.copyTileFrame(tile, tile.Animation.TileData.KeyFrames[frame].Frame, 1, cell);
    }
    else {
      //Error.
      Globals.debugBreak();
    }
  }
  public copyTileFrame(tile: Sprite25D, frame: SpriteFrame, blend: number = 1, cell: Cell = null) {
    let v: Array<vec3> = new Array<vec3>(4);
    let flags = tile.DirtyFlags;
    if (blend) {
      flags |= DirtyFlag.Colors;
    }
    if (cell) {
      flags |= DirtyFlag.UVs;
      flags |= DirtyFlag.Normals;
      flags |= DirtyFlag.Colors;
    }
    /*
    0 --- 1
    |     |
    2 --- 3
    */
    v[0] = tile.QuadVerts[0];
    v[1] = tile.QuadVerts[1];
    v[2] = tile.QuadVerts[2];
    v[3] = tile.QuadVerts[3];

    if (cell) {
      //If we pass a cell in here, then add the cell parent as an absolute offset.
      let cp: vec2 = cell.PixelPosR3;
      cp.x /= g_atlas.TileWidthPixels;
      cp.y /= g_atlas.TileHeightPixels;
      for (let vi = 0; vi < 4; ++vi) {
        v[vi] = v[vi].clone();
        v[vi].x += cp.x;
        v[vi].y += cp.y;
      }
    }

    this.copyFrameQuad(frame, v, tile.QuadNormal, tile.Color, blend, tile.FlipH, tile.FlipV, flags);
  }
  public copyFrameQuad(frame: SpriteFrame, v: Array<vec3>, normal: vec3, color: vec4, blend: number, fliph: boolean, flipv: boolean, flags: number = DirtyFlag.All) {
    let off = this._usedBufferLengthTiles * 4;

    this._updFlags |= flags;

    let verts: Float32Array = (this._attrPosition.array as Float32Array);
    let norms: Float32Array = (this._attrNormal.array as Float32Array);
    let colors: Float32Array = (this._attrColor.array as Float32Array);
    let uvs: Float32Array = (this._attrTexture.array as Float32Array);

    for (let vi = 0; vi < 4; ++vi) {
      let vv = off + vi;

      verts[vv * this._vsiz + 0] = v[vi].x;
      verts[vv * this._vsiz + 1] = v[vi].y;
      verts[vv * this._vsiz + 2] = v[vi].z;

      if (flags & DirtyFlag.Normals) {
        norms[vv * this._nsiz + 0] = normal.x;//this._view.Normal.x;
        norms[vv * this._nsiz + 1] = normal.y;
        norms[vv * this._nsiz + 2] = normal.z;
      }
      if (flags & DirtyFlag.Colors) {
        colors[vv * this._csiz + 0] = color.x;
        colors[vv * this._csiz + 1] = color.y;
        colors[vv * this._csiz + 2] = color.z;
        colors[vv * this._csiz + 3] = color.w * blend;
      }
    }

    if (flags & DirtyFlag.UVs) {
      if (frame) {
        this.copyFrameUVs(uvs, frame, fliph, flipv, off);
      }
    }

    this._debugNumCopies++;
    this._usedBufferLengthTiles++;
  }
  private copyFrameUVs(uvs: Float32Array, frame: SpriteFrame, fliph: boolean, flipv: boolean, off: number) {
    let f = frame;
    let x0 = f.x;
    let y0 = f.y;
    let x1 = f.x + f.w;
    let y1 = f.y + f.h;

    if (fliph) {
      let t = x0;
      x0 = x1;
      x1 = t;
    }
    if (flipv) {
      let t = y0;
      y0 = y1;
      y1 = t;
    }

    uvs[off * 2 + 0] = x0;
    uvs[off * 2 + 1] = y1;
    uvs[off * 2 + 2] = x1;
    uvs[off * 2 + 3] = y1;
    uvs[off * 2 + 4] = x0;
    uvs[off * 2 + 5] = y0;
    uvs[off * 2 + 6] = x1;
    uvs[off * 2 + 7] = y0;
  }
  private fillDefault(vb: Float32Array, tb: Float32Array, nb: Float32Array, cb: Float32Array) {
    vb[0] = 0;
    vb[1] = 0;
    vb[2] = 0;

    vb[3] = 1;
    vb[4] = 0;
    vb[5] = 0;

    vb[6] = 0;
    vb[7] = -1;
    vb[8] = 0;

    vb[9] = 1;
    vb[10] = -1;
    vb[11] = 0;

    tb[0] = 0;
    tb[1] = 1;
    tb[2] = 1;
    tb[3] = 1;
    tb[4] = 0;
    tb[5] = 0;
    tb[6] = 1;
    tb[7] = 0;

    for (let xx = 0; xx < 4; ++xx) {
      nb[xx * 3 + 0] = 0;
      nb[xx * 3 + 1] = 0;
      nb[xx * 3 + 2] = 1;
      cb[xx * 4 + 0] = 1;
      cb[xx * 4 + 1] = 0;
      cb[xx * 4 + 2] = 1;
      cb[xx * 4 + 3] = 1;
    }
    this.setDrawRange(0, 6);
  }
  private updateBufferRange() {
    if (this._usedBufferLengthTiles > 0) {
      this.setDrawRange(0, this._usedBufferLengthTiles * 6);
    }
    else {
      this.setDrawRange(0, 6);
    }
  }
}

export class WorldView25D extends Object3D {
  public static readonly Normal: vec3 = new vec3(0, 0, 1);
  public static readonly Right: vec3 = new vec3(1, 0, 0);
  public static readonly Down: vec3 = new vec3(0, -1, 0);
  public static readonly LayerDepth: number = 0.01;

  public Atlas: Atlas = null;

  private _buffer: TileBuffer = null;

  private _boxHelper: THREE.BoxHelper = null;
  private _mesh: THREE.Mesh = null;

  private _objects: Map<Sprite25D, Sprite25D> = new Map<Sprite25D, Sprite25D>(); // Objects that do not update.
  private _destroyed: Map<Sprite25D, Sprite25D> = new Map<Sprite25D, Sprite25D>();

  public get Buffer(): TileBuffer { return this._buffer; }

  private _platformLevel: MasterMap = null;
  public get PlatformLevel(): MasterMap { return this._platformLevel; }

  private _playerchar: Sprite25D = null;

  public set Player(p: Sprite25D) { this._playerchar = p; }
  public get Player(): Sprite25D { return this._playerchar; }

  public get Viewport() : Viewport25D { return this._viewport; }

  public constructor(r: Atlas) {
    super();
    this.Atlas = r;
  }
  public init(bufSizeTiles: Int) {
    //6 high x 16 wide
    this._viewport = new Viewport25D(256 as Int, 92 as Int);

    //This is where the most of the level processing happens.
    //hold onto your butts.
    this._platformLevel = new MasterMap(g_atlas);

    this._buffer = new TileBuffer(bufSizeTiles * 4, this);

    let mat = new THREE.MeshBasicMaterial({
      color: 0xffffff
      , side: THREE.DoubleSide
      , map: this.Atlas.Texture
      , vertexColors: THREE.VertexColors
      , flatShading: false
      , transparent: false //Adds this to the transparency step of the rasterizer.
      , wireframe: false
      , alphaTest: 0.01 // Quickly cut out shitty transparency
      //blending - if we really do end up with blended keyframes we can add this, but right now it's messing stuff up
      //, blending: THREE.MultiplyBlending // or Normalblending (unsure)
    });

    this._mesh = new THREE.Mesh(this._buffer, mat);

    this.add(this._mesh);
  }
  public addObject25(ob: Sprite25D) {
    if (ob.Destroyed === false) {
      ob.WorldView = this;
      this._objects.set(ob, ob);
      ob.markDirty();
    }
  }
  public removeObject25(ob: Sprite25D) {
    if (ob.Destroyed === false) {
      ob.WorldView = null;
      this._objects.delete(ob);
    }
  }
  public destroyObject25(ob: Sprite25D) {
    this._destroyed.set(ob, ob);
    ob.Destroyed = true;
  }
  public update(dt: number) {
    //Update Objects
    for (const [key, value] of this._objects) {
      //There may be a faster way to do this. For instance, static objects don't update.
      key.update(dt);
    }

    this.updateViewport();

    this.updatePostPhysics();

    //Copy Render Data
    this._buffer.beginCopy();

    if (Globals.isDebug()) {
      this.debug_DrawCells();
    }

    this.drawBackground();
    this.drawMidground();
    this.drawObjects();
    this.drawForeground();

    this._buffer.endCopy();

    //Box
    if (Globals.isDebug()) {
      if (this._boxHelper !== null) {
        this.remove(this._boxHelper);
      }
      this._boxHelper = new THREE.BoxHelper(this._mesh, new THREE.Color(0xffff00));
      this.add(this._boxHelper);
    }
  }

  private copyObjectTiles(ob: Sprite25D) {
    this._buffer.copyObjectTile(ob);
    ob.clearDirty();

    for (let ci = 0; ci < ob.Children.length; ci++) {
      this.copyObjectTiles(ob.Children[ci]);
    }
  }
  private copyCellTiles(cell: Cell, ob: Sprite25D, frame: Int) {
    this._buffer.copyCellTile(cell, ob, frame);
    ob.clearDirty();

    for (let ci = 0; ci < ob.Children.length; ci++) {
      this.copyCellTiles(cell, ob.Children[ci], frame);
    }
  }
  private updateViewport() {
    if (!this.Player) {
      Globals.debugBreak();
    }
    this._viewport.calcBoundBox();
  }
  private _viewport: Viewport25D = null;
  private _viewportCellsFrame: Array<Cell> = null;
  private updatePostPhysics() {
    this._viewportCellsFrame = this._platformLevel.Grid.GetCellManifoldForBox(this._viewport.Box)

  }
  private debug_DrawCells() {
    for (let c of this._viewportCellsFrame) {
      if (c) {
        this.drawCell(c);
      }
    }
    
    for (let c of this._viewportCellsFrame) {
      if (c) {
        this.drawCell(c);
      }
    }
  }
  private drawCell(c: Cell) {
    if (Cell.DebugFrame === null) {
      Cell.DebugFrame = SpriteFrame.fromAtlasTile(this.Atlas, 2 as Int, 0 as Int);
    }
    if (c.DebugVerts === null || c.DebugVerts.length < 4) {
      SpriteFrame.createQuadVerts(c.DebugVerts, c.TilePosR3, Atlas.TileWidthR3, Atlas.TileHeightR3, -1 as Int, WorldView25D.LayerDepth);
    }
    this._buffer.copyFrameQuad(Cell.DebugFrame, c.DebugVerts, WorldView25D.Normal, new vec4(c.DebugColor.r, c.DebugColor.g, c.DebugColor.b, 1), 1, false, false, DirtyFlag.All);
  }

  private drawForeground() {

  }
  private drawMidground() {

  }
  private drawObjects() {
    for (const [key, value] of this._objects) {
      if (key.Visible) {
        //There may be a faster way to do this. For instance, static objects don't update.
        this.copyObjectTiles(key);
      }
    }
  }
  private drawBackground() {
    for (let c of this._viewportCellsFrame) {
      if (c) {
        let block: TileBlock = c.Layers[TileLayer.Midground];
        if (!block) {
          continue;
        }
        if (!block.spriteRef) {
          continue;
        }
        this.drawBlock(c, block);
      }
    }
  }
  private drawBlock(c: Cell, block: TileBlock) {
    this.copyCellTiles(c, block.spriteRef, block.frameIndex);
  }
}
export class Viewport25D {
  private _widthPixels: Int = 0 as Int;
  private _heightPixels: Int = 0 as Int;

  // private _pos: vec2 = new vec2(0, 0);
  private _box: Box2f = new Box2f();

  public Center: vec3 = new vec3(0, 0, 0);
  public Campos: vec3 = new vec3(0, 0, 0);

  public get WidthPixels(): Int { return this._widthPixels; }
  public get HeightPixels(): Int { return this._heightPixels; }

  // public get Pos(): vec2 { return this._pos; }
  // public set Pos(x: vec2) { this._pos = x; }

  public get TilesWidth(): Int { return Math.floor(this._widthPixels / g_atlas.TileWidthPixels) as Int; }
  public get TilesHeight(): Int { return Math.floor(this._heightPixels / g_atlas.TileHeightPixels) as Int; }

  // private _screenShakeOffset: vec2 = new vec2(0, 0);
  // public set ScreenShakeOffset(x: vec2) { this._screenShakeOffset = x; }
  // public get ScreenShakeOffset(): vec2 { return this._screenShakeOffset; }

  public get Box(): Box2f { return this._box; }

  public constructor(width_pixels: Int, height_pixels: Int) {
    this._widthPixels = width_pixels;
    this._heightPixels = height_pixels;
  }
  // public followObject(ob: Sprite25D) {
  //   //Follow a game object
  //   //Call with LimitScrollBounds to limit scrolling in a region
  //   this._pos = new vec2(
  //     ob.Position.x - g_atlas.TileWidthPixels * this.TilesWidth * 0.5 + g_atlas.TileWidthPixels * 0.5,
  //     ob.Position.y - g_atlas.TileHeightPixels * this.TilesHeight * 0.5 + g_atlas.TileHeightPixels * 0.5
  //   ).add(this._screenShakeOffset);
  // }
  // public limitScrollBounds(box: Box2f) {
  //   //Limit the viewport to scrolling box
  //   if (box.Width() > this.WidthPixels) {
  //     if (this._pos.x < box.Min.x) {
  //       this._pos.x = box.Min.x;
  //     }
  //     if (this._pos.x + this.WidthPixels >= box.Max.x) {
  //       this._pos.x = box.Max.x - this.WidthPixels;
  //     }
  //   }
  //   if (box.Height() > this.HeightPixels) {
  //     if (this._pos.y < box.Min.y) {
  //       this._pos.y = box.Min.y;
  //     }
  //     if (this._pos.y + this.HeightPixels >= box.Max.y) {
  //       this._pos.y = box.Max.y - this.HeightPixels;
  //     }
  //   }
  // }
  public calcBoundBox() {
    let tw = this.TilesWidth;
    let th = this.TilesHeight;
    this._box = new Box2f();
    this._box.Min.x = this.Center.x - tw;
    this._box.Min.y = this.Center.y - th;
    this._box.Max.x = this.Center.x + tw;
    this._box.Max.y = this.Center.y + th;
  }
}
class InputControls {
  private _playerChar: Sprite25D = null;
  private _playerCharZoom: number = 6;

  private _viewport: Viewport25D = null;

  public constructor(playerChar: Sprite25D, viewport: Viewport25D) {
    this._playerChar = playerChar;
    this._viewport = viewport;
  }
  public update(dt: number) {

    //Movement
    if (Globals.input.mouse.Left.pressed()) {
      Globals.input.left.Axis.set(0, 0);
      Globals.input.keyboard.SmoothAxis = true;
    }
    else if (Globals.input.mouse.Left.released()) {
      Globals.input.keyboard.SmoothAxis = false;
      Globals.input.left.Axis.set(0, 0);
    }
    if (Globals.input.mouse.Right.pressOrHold()) {
      this.movePlayer(dt);
    } else {
      this.movePlayerChar(dt);
      this.zoomPlayerChar();
    }

    if (this._playerChar.Animation.CurrentAnimation === null) {
      this._playerChar.Animation.play("walk_down", true);
    }

    //Update hand
    if (g_hand) {
      if (Globals.userIsInVR()) {
        g_hand.position.copy(Globals.input.right.Position);
      }
      else {
        let handpos = Globals.screen.project3D(Globals.input.mouse.x, Globals.input.mouse.y, 4);
        g_hand.position.copy(handpos);
      }
    }
  }
  private movePlayer(dt: number) {
    let player = Globals.player;
    let spd = 12;
    let amtstr = spd * Globals.input.left.Axis.x * dt;
    if (amtstr !== 0) {
      let n: vec3 = new vec3(0, 0, 0);
      Globals.camera.getWorldDirection(n);
      let r: vec3 = n.clone().cross(new vec3(0, 1, 0)).normalize();

      player.position.add(r.multiplyScalar(amtstr));
    }

    let amtfw: number = spd * Globals.input.left.Axis.y * dt;
    if (amtfw !== 0) {
      let n: vec3 = new vec3(0, 0, 0);
      Globals.camera.getWorldDirection(n);
      player.position.add(n.multiplyScalar(amtfw));
    }
  }
  public lookAtPlayerChar() {
    let c: vec2 = this._playerChar.BoundBox.Center();
    let center = new vec3(c.x, c.y, this._playerChar.Position.z);

    center.add(g_mainWorld.position);//Not sure if we're actually going to move the world but it's possible i guess

    let position = center.clone().add(this._playerChar.QuadNormal.clone().multiplyScalar(this._playerCharZoom));

    Globals.player.position.copy(position);

    //If in VR the user may not have to look at this exact thing.
    Globals.camera.lookAt(center);

    this._viewport.Center = center;
    this._viewport.Campos = position;
  }
  private zoomPlayerChar() {
    let zoomPerWheel = 0.1;
    let maxZoom: number = 8;
    let minZoom: number = 3;

    if (Globals.isDebug()) {
      maxZoom = 9999;
    }

    if (Globals.input.mouse.Wheel !== 0) {
      this._playerCharZoom += Globals.input.mouse.Wheel * zoomPerWheel;
      this._playerCharZoom = Math.max(minZoom, Math.min(maxZoom, this._playerCharZoom));
      this.lookAtPlayerChar();
    }
  }
  private movePlayerChar(dt: number) {
    let base_speed: number = 1.7;
    let speed = base_speed * dt;
    if (Globals.input.keyboard.Shift.pressOrHold()) {
      speed = (20) * dt;
    }
    if (Globals.input.left.MoveLeft) {
      this._playerChar.Animation.play("walk_left", true);
      this._playerChar.Position.sub(WorldView25D.Right.clone().multiplyScalar(speed));
      this.lookAtPlayerChar();
    }
    else if (Globals.input.left.MoveRight) {
      this._playerChar.Animation.play("walk_right", true);
      this._playerChar.Position.add(WorldView25D.Right.clone().multiplyScalar(speed));
      this.lookAtPlayerChar();
    }
    else if (Globals.input.left.MoveUp) {
      this._playerChar.Animation.play("walk_up", true);
      this._playerChar.Position.add(WorldView25D.Down.clone().multiplyScalar(speed));
      this.lookAtPlayerChar();
    }
    else if (Globals.input.left.MoveDown) {
      this._playerChar.Animation.play("walk_down", true);
      this._playerChar.Position.sub(WorldView25D.Down.clone().multiplyScalar(speed));
      this.lookAtPlayerChar();
    }
    else {
      this._playerChar.Animation.pause();
      this._playerChar.Animation.setKeyFrame(0, null, true);
    }
  }
}
let g_ambientlight: THREE.AmbientLight = null;
let axis: THREE.AxesHelper = null;
let gridhelper: THREE.GridHelper = null;
let g_hand: THREE.Object3D = null;

let g_atlas: Atlas = null;
let g_mainWorld: WorldView25D = null;
let g_inputControls: InputControls = null;

$(document).ready(function () {
  Globals.setFlags(document.location);

  Globals.init();
  Globals.prof.frameStart();

  loadResources();
});
function loadResources() {

  //https://threejs.org/docs/#manual/en/introduction/Animation-system

  // this should really be handled by a promise.
  g_atlas = new Atlas(
    1 as Int, 1 as Int, 1 as Int, 1 as Int,
    1 as Int, 1 as Int,
    16 as Int, 16 as Int, './dat/img/tiles.png', function () {
      Globals.models.loadModel(Files.Model.Hand, ['Armature', 'Action_Point'], function (success: boolean, arr: Array<Object3D>, gltf: any): THREE.Object3D {
        if (success) {
          if (arr.length === 2) {
            return arr[0];
          }
        }
        return null;
      })
    });
  Globals.models.setModelAsyncCallback(Files.Model.Hand, function (model: THREE.Mesh) {
    g_hand = model;
    //Apply Hand Transforms.
    //Note: We might be able to swap left/right here.
    g_hand.rotateY(Math.PI);
    //g_hand.scale.set(-1,0,0);


    Globals.scene.add(g_hand);

    initializeGame();
  });
}
function initializeGame() {
  createWorld();

  g_ambientlight = new THREE.AmbientLight(new Color(1, 1, 1));
  Globals.scene.add(g_ambientlight);

  if (Globals.isDebug()) {
    axis = new THREE.AxesHelper(1);
    Globals.scene.add(axis);
    gridhelper = new THREE.GridHelper(100, 30, new THREE.Color(1, 0.6, 1), new THREE.Color(0.6, 1, 1))
    Globals.scene.add(gridhelper);
  }

  Globals.prof.frameEnd();
  $('#outPopUp').hide();

  Globals.startGameEngine(gameLoop);
}
function createWorld() {
  //Load Resources
  g_mainWorld = new WorldView25D(g_atlas);
  g_mainWorld.init(2048 as Int);
  Globals.scene.add(g_mainWorld);

  let player = g_mainWorld.PlatformLevel.Tiles.getTile(TiledSpriteId.Player);

  g_inputControls = new InputControls(player, g_mainWorld.Viewport);
  g_mainWorld.addObject25(player);
  g_mainWorld.Player = player;

  //Drop player
  player.Position.x = g_mainWorld.PlatformLevel.PlayerStartXY.x;
  player.Position.y = g_mainWorld.PlatformLevel.PlayerStartXY.y;

  player.update(0.0001);
  g_inputControls.lookAtPlayerChar();
}

function listenForGameStart() {
  if (Globals.input.right.A.pressed() || Globals.input.right.Trigger.pressed() || Globals.input.left.A.pressed() || Globals.input.left.Trigger.pressed()) {
    startGame();
  }
}
function startGame() {
  Globals.gameState = GameState.Play;
}
function gameLoop(dt: number) {
  Globals.prof.begin("main game loop");
  if (Globals.gameState === GameState.Title) {
    listenForGameStart();
  }

  if (axis) {
    axis.position.set(Globals.player.position.x - 3, Globals.player.position.y - 3, Globals.player.position.z - 10);
  }

  g_inputControls.update(dt);
  g_mainWorld.update(dt);
  Globals.prof.end("main game loop");
}
