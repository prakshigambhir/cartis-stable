// Public gateway. Every request re-checks publication and the exact approved asset.
// Service credentials stay in the Edge runtime; no signed or private storage URLs leave it.
import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Methods': 'GET, OPTIONS',
 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, range',
 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
 'Cache-Control': 'private, no-store, max-age=0',
 'CDN-Cache-Control': 'no-store',
 'Vercel-CDN-Cache-Control': 'no-store',
 'X-Content-Type-Options': 'nosniff',
 'Referrer-Policy': 'no-referrer'
};
Deno.serve(async (request: Request) => {
 if (request.method === 'OPTIONS') return new Response(null, {headers});
 if (request.method !== 'GET') return new Response('Method not allowed', {status:405,headers});
 const url = new URL(request.url), id = url.searchParams.get('listing'), assetId = url.searchParams.get('asset');
 if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !assetId || assetId.length > 200) return new Response('Unavailable',{status:404,headers});
 try {
  const client = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data, error} = await client.from('carrot_sale_publications').select('state,assets,owner_id').eq('id',id).maybeSingle();
  const asset = data?.state === 'published' ? data.assets?.[assetId] : null;
  if (error || !asset) return new Response('Unavailable',{status:404,headers});
  let blob: Blob;
  if (asset.path && asset.path.split('/')[0] === data.owner_id) {
   const result = await client.storage.from('cartis-private').download(asset.path);
   if (result.error || !result.data) return new Response('Unavailable',{status:404,headers});
   blob = result.data;
  } else if (typeof asset.data === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(asset.data)) {
   const [meta,body] = asset.data.split(',');
   blob = new Blob([Uint8Array.from(atob(body),c=>c.charCodeAt(0))],{type:meta.slice(5).split(';')[0]});
  } else return new Response('Unavailable',{status:404,headers});
  if (!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(blob.type)) return new Response('Unavailable',{status:404,headers});
  // Recheck after download: an unpublish while storage was being read revokes this response too.
  const current = await client.from('carrot_sale_publications').select('state,assets').eq('id',id).maybeSingle();
  if (current.error || current.data?.state !== 'published' || JSON.stringify(current.data.assets?.[assetId]) !== JSON.stringify(asset)) return new Response('Unavailable',{status:404,headers});
  const responseHeaders = {...headers,'Content-Type':blob.type,'Accept-Ranges':'bytes','Content-Disposition':'inline'};
  const range = request.headers.get('Range');
  if (range) {
   const match = /^bytes=(\d*)-(\d*)$/.exec(range);
   if (!match || (!match[1]&&!match[2])) return new Response(null,{status:416,headers:{...responseHeaders,'Content-Range':`bytes */${blob.size}`}});
   const start = match[1] ? Number(match[1]) : Math.max(0,blob.size-Number(match[2]));
   const end = match[1] ? (match[2]?Math.min(Number(match[2]),blob.size-1):blob.size-1) : blob.size-1;
   if (start>end || start>=blob.size) return new Response(null,{status:416,headers:{...responseHeaders,'Content-Range':`bytes */${blob.size}`}});
   return new Response(blob.slice(start,end+1),{status:206,headers:{...responseHeaders,'Content-Range':`bytes ${start}-${end}/${blob.size}`,'Content-Length':String(end-start+1)}});
  }
  return new Response(blob,{headers:{...responseHeaders,'Content-Length':String(blob.size)}});
 } catch {return new Response('Media temporarily unavailable',{status:503,headers});}
});
