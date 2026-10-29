/** Framework-independent contracts for future Pixi editors and game clients. */
export type ContentKind = 'environment' | 'base' | 'character' | 'animation' | 'vfx';
export type SceneData = { width: number; height: number; layers: { id: string; objects: Record<string, unknown>[]; [key: string]: unknown }[]; [key: string]: unknown };
export type Frame = { asset: string; x: number; y: number; width: number; height: number };
export type AnimationData = { fps: number; loop: boolean; frames: Frame[]; [key: string]: unknown };
type Envelope<K extends ContentKind, D> = { schemaVersion: 1; kind: K; name: string; assets: string[]; data: D };
export type ContentDocument = Envelope<'environment' | 'base', SceneData> | Envelope<'character', { animations: Record<string, string>; [key: string]: unknown }> | Envelope<'animation' | 'vfx', AnimationData>;
export type Draft = { id: string; revision: number; document: ContentDocument };
export type Asset = { sha256: string; size: number; mediaType: string; url: string };
export type Selection = { id: string; revision: number };
export type Manifest = { schemaVersion: 1; id: string; createdAt: string; documents: (Selection & { sha256: string; url: string })[]; assets: Asset[] };
export class ContentAPIError extends Error {
 constructor(public status: number, public code: string) { super(code); }
 get isConflict() { return this.status === 409; }
}
export class ContentClient {
 constructor(private baseURL: string, private getToken?: () => string | Promise<string>) {}
 private async request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (authenticated) { if (!this.getToken) throw new Error('Editor authentication required'); headers.set('Authorization', `Bearer ${await this.getToken()}`); }
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(new URL(path, this.baseURL), { ...init, headers });
  if (!response.ok) { const body = await response.json().catch(() => ({error: 'request_failed'})); throw new ContentAPIError(response.status, body.error); }
  return response.status === 204 ? undefined as T : response.json();
 }
 listDrafts() { return this.request<Draft[]>('/v1/drafts', {}, true); }
 loadDraft(id: string) { return this.request<Draft>(`/v1/drafts/${encodeURIComponent(id)}`, {}, true); }
 /** revision 0 creates; use the returned revision for subsequent saves. Never silently overwrite a 409. */
 saveDraft(id: string, revision: number, document: ContentDocument) { return this.request<Draft>(`/v1/drafts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ revision, document }) }, true); }
 deleteDraft(id: string, revision: number) { return this.request<void>(`/v1/drafts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'If-Match': `"${revision}"` } }, true); }
 uploadAsset(bytes: Blob) { return this.request<Asset>('/v1/assets', { method: 'POST', body: bytes }, true); }
 publish(channel: string, documents: Selection[]) { return this.request<Manifest>('/v1/releases', { method: 'POST', body: JSON.stringify({ channel, documents }) }, true); }
 /** Game client needs no editor token. Pin the returned release for the complete load. */
 async loadChannel(channel = 'stable') {
  const pointer = await this.request<{releaseId: string; manifestUrl: string}>(`/v1/channels/${encodeURIComponent(channel)}`);
  return this.loadRelease(pointer.releaseId);
 }
 loadRelease(id: string) { return this.request<Manifest>(`/v1/releases/${encodeURIComponent(id)}`); }
 async loadPublishedDocument(release: Manifest, id: string): Promise<ContentDocument> {
  const entry = release.documents.find(d => d.id === id); if (!entry) throw new Error('Document absent from release');
  const response = await fetch(new URL(`/v1/releases/${encodeURIComponent(release.id)}/documents/${encodeURIComponent(id)}`, this.baseURL));
  if (!response.ok) throw new ContentAPIError(response.status, 'published_document_unavailable');
  const bytes = await response.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (digest !== entry.sha256) throw new Error('Published document integrity mismatch');
  return JSON.parse(new TextDecoder().decode(bytes)) as ContentDocument;
 }
}
