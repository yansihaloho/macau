import { Router, type IRouter } from "express";
import healthRouter from "./health";
import lotteryRouter from "./lottery";
import syncRouter from "./sync";
import analyticsRouter from "./analytics";
import predictionRouter from "./prediction";
import predictionV4Router from "./prediction-v4";
import predictionV5Router from "./prediction-v5";
import predictionV6Router from "./prediction-v6";

const router: IRouter = Router();

router.use(healthRouter);
router.use(lotteryRouter);
router.use(syncRouter);
router.use(analyticsRouter);
router.use(predictionRouter);
router.use("/prediction", predictionV4Router);
router.use("/prediction", predictionV5Router);
router.use("/prediction", predictionV6Router);

export default router;
