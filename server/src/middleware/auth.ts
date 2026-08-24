import { NextFunction, Request, Response } from 'express'; import jwt from 'jsonwebtoken'; import { Role } from '@prisma/client'; import { config } from '../config.js'; import { ApiError } from '../errors.js';
export interface AuthRequest extends Request { user?:{id:string;role:Role;email:string} }
export function authenticate(req:AuthRequest,_res:Response,next:NextFunction){ try {const raw=req.headers.authorization?.replace('Bearer ',''); if(!raw) throw 0; req.user=jwt.verify(raw,config.jwt) as any; next();}catch{next(new ApiError(401,'Authentication required'));} }
export const authorize=(...roles:Role[])=>(req:AuthRequest,_res:Response,next:NextFunction)=>!req.user||!roles.includes(req.user.role)?next(new ApiError(403,'Insufficient permissions')):next();
