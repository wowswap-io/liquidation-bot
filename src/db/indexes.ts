import { DatastoreCtor } from "./connection";
import { DatastoreDocument, IndexTypes } from "./document";

export const INDEX_PREFIX_SIZE = 16;
export const MODEL_PREFIX_SIZE = 8;

export abstract class AbstractIndex<
  TDoc extends DatastoreDocument<TDoc>,
  TKey extends keyof TDoc
> {
  public prefix: Buffer;
  protected reference: TDoc;

  constructor(
    protected ctor: DatastoreCtor<TDoc>,
    public size: number,
    public key: TKey,
    private transform: (value: TDoc[TKey]) => Buffer
  ) {
    this.reference = new this.ctor();
    this.prefix = Buffer.alloc(INDEX_PREFIX_SIZE, 0);
    this.prefix.writeUInt8('P'.charCodeAt(0))
    Buffer.from(this.ctor.name.toString()).copy(this.prefix, 1);
    const tmp = Buffer.from(key.toString());
    tmp.copy(this.prefix, MODEL_PREFIX_SIZE);

    this.prefix;
  }

  public abstract readonly indexType: IndexTypes;

  public getValue(instance: TDoc): TDoc[TKey] {
    return instance[this.key];
  }

  public getValueBuffer(instance: TDoc): Buffer {
    return this.valueToBuffer(this.getValue(instance));
  }

  public valueToBuffer(value: TDoc[TKey]): Buffer {
    const buf = Buffer.alloc(this.size, 0);
    const tmp = this.transform(value);
    tmp.copy(buf, Math.max(0, buf.length - tmp.length));
    return buf;
  }

  public setValue(buffer: Buffer, value: TDoc[TKey]) : void {
    this.setValueBuffer(buffer, this.valueToBuffer(value))
  }
  public setValueBuffer(buffer: Buffer, valueBuffer: Buffer) : void {
    valueBuffer.copy(buffer, this.prefix.length + Math.max(0, this.size - valueBuffer.length), 0, this.size)
  }

  public abstract setKeyMax(buffer: Buffer) : void;
  public abstract setKeyMin(buffer: Buffer) : void;

  public abstract getIndexKey(instance: TDoc): Buffer;
  public abstract getLowerBound(instance: TDoc): Buffer;
  public abstract getUpperBound(instance: TDoc): Buffer;
}

export class RangeIndex<
  TDoc extends DatastoreDocument<TDoc> = any,
  TKey extends keyof TDoc = keyof TDoc
> extends AbstractIndex<TDoc, TKey> {
  public get indexType() {
    return IndexTypes.Index;
  }

  public setKeyMax(buffer: Buffer) {
    buffer.fill(255, this.prefix.length + this.size)
  }
  public setKeyMin(buffer: Buffer) {
    buffer.fill(0, this.prefix.length + this.size)
  }

  public getIndexKey(instance: TDoc): Buffer {
    const keyDefinition = instance.getKeyDefinition();
    const keyBuffer = instance.getKey(keyDefinition);

    const buf = Buffer.alloc(
      this.prefix.length + this.size + keyDefinition.size
    );

    this.prefix.copy(buf, 0);
    this.getValueBuffer(instance).copy(buf, this.prefix.length);
    keyBuffer.copy(buf, this.prefix.length + this.size);

    return buf;
  }

  public getLowerBound(instance: TDoc): Buffer {
    const keyDefinition = instance.getKeyDefinition();
    const buf = Buffer.alloc(
      this.prefix.length + this.size + keyDefinition.size,
      0
    );

    this.prefix.copy(buf, 0);

    return buf;
  }

  public getUpperBound(instance: TDoc): Buffer {
    const keyDefinition = instance.getKeyDefinition();
    const buf = Buffer.alloc(
      this.prefix.length + this.size + keyDefinition.size,
      255
    );

    this.prefix.copy(buf, 0);

    return buf;
  }
}

export class UniqueIndex<
  TDoc extends DatastoreDocument<TDoc> = any,
  TKey extends keyof TDoc = keyof TDoc
> extends AbstractIndex<TDoc, TKey> {
  public get indexType() {
    return IndexTypes.Unique;
  }

  public setKeyMax(buffer: Buffer) {}
  public setKeyMin(buffer: Buffer) {}

  public getIndexKey(instance: TDoc): Buffer {
    const buf = Buffer.alloc(this.prefix.length + this.size);

    this.prefix.copy(buf, 0);
    this.getValueBuffer(instance).copy(buf, this.prefix.length);

    return buf;
  }

  public getLowerBound(instance: TDoc): Buffer {
    const buf = Buffer.alloc(this.prefix.length + this.size, 0);

    this.prefix.copy(buf, 0);

    return buf;
  }

  public getUpperBound(instance: TDoc): Buffer {
    const buf = Buffer.alloc(this.prefix.length + this.size, 255);

    this.prefix.copy(buf, 0);

    return buf;
  }
}
