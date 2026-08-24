import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
export class ApiError extends Error { constructor(public status:number, message:string){super(message)} }
export const asyncRoute = <T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => unknown): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req as T, res, next)).catch(next);
export const errorHandler=(err:any,_req:Request,res:Response,_next:NextFunction)=>{ if(err instanceof ZodError)return res.status(400).json({success:false,message:'Invalid request data',issues:err.flatten()}); console.error(err); res.status(err.status||500).json({success:false,message:err.status?err.message:'Internal server error'}); };
