import type { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: any, res: any) {
    const urlPath = req.originalUrl || req.url || '';
    
    // Support either Vercel routing (/api/proxy) or local routing
    const match = urlPath.match(/\/api\/proxy\/(https?)\/([^\/]+)(.*)/);
    if (!match) {
      if (!res.headersSent) {
         res.status(400).send('Invalid proxy URL format');
      }
      return;
    }
    
    const protocol = match[1];
    const host = match[2];
    const subPath = match[3] || '/';
    
    const targetUrl = `${protocol}://${host}${subPath}`;

    try {
      const urlObj = new URL(targetUrl);
      const headers = new Headers();
      
      for (const key in req.headers) {
          const lowerKey = key.toLowerCase();
          if (!['host', 'referer', 'origin', 'cookie', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'accept-encoding', 'connection'].includes(lowerKey)) {
              if (req.headers[key]) {
                  headers.set(key, req.headers[key] as string);
              }
          }
      }
      
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      if (req.headers['origin']) {
          headers.set('Origin', urlObj.origin);
      }

      let bodyData;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
         const buffers: any[] = [];
         for await (const chunk of req) { buffers.push(chunk); }
         if (buffers.length > 0) {
             bodyData = Buffer.concat(buffers);
         }
      }

      const proxyResponse = await fetch(targetUrl, {
        method: req.method,
        headers,
        body: bodyData ? new Uint8Array(bodyData) : undefined,
        redirect: 'manual' 
      });

      proxyResponse.headers.forEach((value, key) => {
         const lowerKey = key.toLowerCase();
         if ([
             'x-frame-options', 
             'content-security-policy', 
             'content-security-policy-report-only',
             'set-cookie', 
             'x-xss-protection',
             'content-encoding',
             'content-length',
             'transfer-encoding',
             'strict-transport-security'
         ].includes(lowerKey)) {
             return; 
         }
         
         if (lowerKey === 'location') {
             try {
                const locUrl = new URL(value, targetUrl);
                const rw = `/api/proxy/${locUrl.protocol.replace(':', '')}/${locUrl.host}${locUrl.pathname}${locUrl.search}`;
                res.setHeader('Location', rw);
             } catch(e) {
                res.setHeader('Location', value);
             }
             return;
         }

         try {
           res.append(key, value);
         } catch (e) { }
      });

      res.status(proxyResponse.status);

      const contentType = proxyResponse.headers.get('content-type') || '';

      if (contentType.includes('text/html')) {
         let html = await proxyResponse.text();
         
         let bp = urlObj.pathname;
         if (!bp.endsWith('/')) {
             bp = bp.substring(0, bp.lastIndexOf('/') + 1);
         }
         const proxyBasePath = `/api/proxy/${protocol}/${host}${bp}`;
         
         const injection = `
           <base href="${proxyBasePath}">
           <script>
             try {
                window.parent.postMessage({ 
                    type: 'BROWSER_NAVREQ', 
                    url: '${targetUrl}',
                    title: document.title
                }, '*');
             } catch (e) {}

             document.addEventListener('click', function(e) {
                 const a = e.target.closest('a');
                 if (a && a.href) {
                     e.preventDefault();
                     try {
                        const hrefUrl = new URL(a.href);
                        if (!hrefUrl.pathname.startsWith('/api/proxy/')) {
                            const newUrl = '/api/proxy/' + hrefUrl.protocol.replace(':', '') + '/' + hrefUrl.host + hrefUrl.pathname + hrefUrl.search + hrefUrl.hash;
                            window.location.href = newUrl;
                        } else {
                            window.location.href = a.href;
                        }
                     } catch(err) {
                        window.location.href = a.href;
                     }
                 }
             });
             
             const oFetch = window.fetch;
             window.fetch = async function() {
                 let arg = arguments[0];
                 let urlStr = typeof arg === 'string' ? arg : (arg && arg.url ? arg.url : '');
                 if (urlStr && (urlStr.startsWith('http://') || urlStr.startsWith('https://'))) {
                     try {
                         const u = new URL(urlStr);
                         const rw = '/api/proxy/' + u.protocol.replace(':','') + '/' + u.host + u.pathname + u.search;
                         if (typeof arg === 'string') arguments[0] = rw;
                         else arguments[0] = new Request(rw, arg);
                     } catch(e){}
                 } else if (urlStr && urlStr.startsWith('/')) {
                     try {
                         const rw = '/api/proxy/${protocol}/${host}' + urlStr;
                         if (typeof arg === 'string') arguments[0] = rw;
                         else arguments[0] = new Request(rw, arg);
                     } catch(e){}
                 }
                 return oFetch.apply(this, arguments);
             };
             
             const oOpen = XMLHttpRequest.prototype.open;
             XMLHttpRequest.prototype.open = function() {
                 let urlStr = arguments[1];
                 if (urlStr && (urlStr.startsWith('http://') || urlStr.startsWith('https://'))) {
                     try {
                         const u = new URL(urlStr);
                         arguments[1] = '/api/proxy/' + u.protocol.replace(':','') + '/' + u.host + u.pathname + u.search;
                     } catch(e){}
                 } else if (urlStr && urlStr.startsWith('/')) {
                     try {
                         arguments[1] = '/api/proxy/${protocol}/${host}' + urlStr;
                     } catch(e){}
                 }
                 return oOpen.apply(this, arguments);
             };
           </script>
         `;
         
         if (html.match(/<head[^>]*>/i)) {
             html = html.replace(/<head[^>]*>/i, `$&${injection}`);
         } else if (html.match(/<html[^>]*>/i)) {
             html = html.replace(/<html[^>]*>/i, `$&<head>${injection}</head>`);
         } else {
             html = injection + html;
         }
         
         // Fix CSS loading: Rewrite root-relative URLs
         html = html.replace(/(src|href|action)=["'](\/[^/"'][^"']*)["']/gi, (match, prefix, path) => {
             return `${prefix}="/api/proxy/${protocol}/${host}${path}"`;
         });

         html = html.replace(/(src|href|action)=["'](https?:\/\/[^"']+)["']/gi, (match, prefix, url) => {
             try {
                const u = new URL(url);
                return `${prefix}="/api/proxy/${u.protocol.replace(':','')}/${u.host}${u.pathname}${u.search}"`;
             } catch(e) { return match; }
         });

         res.send(html);
       } else {
         const buffer = await proxyResponse.arrayBuffer();
         res.send(Buffer.from(buffer));
      }

    } catch (err) {
      console.error('Proxy Error for URL:', targetUrl, err);
      if (!res.headersSent) {
          res.status(500).send(`Proxy Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
}
