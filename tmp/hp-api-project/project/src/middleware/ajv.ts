import Ajv from "ajv";
import addFormats from "ajv-formats";
import { Request, Response, NextFunction } from "express";
import { readFileSync } from "node:fs";
import path from "node:path";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function validateBody(schemaFile: string) {
  const schemaPath = path.join(__dirname, "..", "validation", schemaFile);
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));
  const validate = ajv.compile(schema);
  return (req: Request, res: Response, next: NextFunction) => {
    const valid = validate(req.body);
    if (!valid) {
      return res.status(400).json({ message: "Validation error", errors: validate.errors });
    }
    next();
  };
}
