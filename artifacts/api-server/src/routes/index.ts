import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipesRouter);

export default router;
