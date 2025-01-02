// jest.useFakeTimers();
// import { gatewayApp, swaggerDocument } from '../src/app';
// import { difference } from 'lodash';

// describe('verify swagger docs', () => {
//   it('All routes should have swagger documentation', () => {
//     const documentedRoutes = Object.keys(swaggerDocument.paths).sort();

//     const allRoutes: any[] = [];
//     // Get all routes from Fastify
//     gatewayApp.routes.forEach((route) => {
//       let path = route.url;
//       // Remove trailing slash if present
//       if (path.slice(-1) === '/') {
//         path = path.slice(0, -1);
//       }
//       allRoutes.push(path);
//     });

//     allRoutes.sort();
//     const routesNotDocumented = difference(allRoutes, documentedRoutes);
//     expect(routesNotDocumented).toEqual([]);
//   });
// });
