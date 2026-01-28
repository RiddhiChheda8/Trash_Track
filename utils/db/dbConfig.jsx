//psql 'postgresql://neondb_owner:npg_Cj5PRODhl6vH@ep-twilight-hall-a123zw1x-pooler.ap-southeast-1.aws.neon.tech/trashtrack?sslmode=require&channel_binding=require'

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });