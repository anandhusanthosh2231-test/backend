import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import oauthAdminRouter from "./oauth-admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipesRouter);
router.use(oauthAdminRouter);

export default router;

