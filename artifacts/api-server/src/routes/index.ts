import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import oauthAdminRouter from "./oauth-admin";
import imagekitMediaRouter from "./imagekit-media";
import vybeRouter from "./vybe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(imagekitMediaRouter);
router.use(vybeRouter);
router.use(recipesRouter);
router.use(oauthAdminRouter);

export default router;
