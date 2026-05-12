import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routes/routers";

export const trpc = createTRPCReact<AppRouter>();
