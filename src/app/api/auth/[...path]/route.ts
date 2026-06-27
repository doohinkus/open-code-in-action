import { getAuth } from "@/lib/auth/server";

let _handler: { GET: any; POST: any } | null = null;
function getHandler() {
  if (!_handler) {
    _handler = getAuth().handler();
  }
  return _handler;
}

export const GET = (req: Request, ctx: any) => getHandler().GET(req, ctx);
export const POST = (req: Request, ctx: any) => getHandler().POST(req, ctx);
