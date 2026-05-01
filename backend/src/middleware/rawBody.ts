import { Request, Response, NextFunction } from "express";

export const rawBodyMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  req.rawBody = req.body as Buffer;
  req.body = (req.body as Buffer).length
    ? JSON.parse((req.body as Buffer).toString())
    : {};
  next();
};
