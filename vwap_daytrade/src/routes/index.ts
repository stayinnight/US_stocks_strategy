const Router = require('koa-router');
import positionRouter  from './position';
import configRouter  from './config';

const router = new Router({
  prefix: '/api'
});

router.use('/position', positionRouter.routes());
router.use('/config', configRouter.routes());

export default router;
