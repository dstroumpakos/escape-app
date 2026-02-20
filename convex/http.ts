import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

const widgetHandler = httpAction(async (ctx) => {
  const bundle = await ctx.runQuery(api.widget.getBundle);

  if (!bundle) {
    return new Response("// Widget bundle not uploaded yet", {
      status: 404,
      headers: {
        "Content-Type": "application/javascript",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(bundle.content, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
});

const corsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
});

// Serve at /widget.js (cached by CDN) and /booking-widget.js (fresh path)
http.route({ path: "/widget.js", method: "GET", handler: widgetHandler });
http.route({ path: "/widget.js", method: "OPTIONS", handler: corsHandler });
http.route({ path: "/booking-widget.js", method: "GET", handler: widgetHandler });
http.route({ path: "/booking-widget.js", method: "OPTIONS", handler: corsHandler });

export default http;
