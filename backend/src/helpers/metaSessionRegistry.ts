export class MetaSessionRegistry<T> {
  private byWhatsappId = new Map<number, T>();
  private bySecondaryKey = new Map<string, number>();

  constructor(
    private getSecondaryKey: (s: T) => string,
    private loadFromDb: () => Promise<Array<{ id: number; session: T }>>
  ) {}

  load(whatsappId: number, session: T): void {
    this.byWhatsappId.set(whatsappId, session);
    this.bySecondaryKey.set(this.getSecondaryKey(session), whatsappId);
  }

  remove(whatsappId: number): void {
    const s = this.byWhatsappId.get(whatsappId);
    if (s) this.bySecondaryKey.delete(this.getSecondaryKey(s));
    this.byWhatsappId.delete(whatsappId);
  }

  getByWhatsappId(whatsappId: number): T | undefined {
    return this.byWhatsappId.get(whatsappId);
  }

  async resolveBySecondaryKey(key: string): Promise<number | null> {
    const cached = this.bySecondaryKey.get(key);
    if (cached !== undefined) return cached;

    const records = await this.loadFromDb();
    for (const r of records) this.load(r.id, r.session);

    return this.bySecondaryKey.get(key) ?? null;
  }
}
