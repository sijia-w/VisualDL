import {NextFunction, Request, Response} from 'express';
import {
    addSubpath,
    lngFromReq,
    redirectWithoutCache,
    removeSubpath,
    subpathFromLng,
    subpathIsPresent,
    subpathIsRequired
} from '../utils';

import NextI18Next from '../index';
import i18nextMiddleware from 'i18next-http-middleware';
import pathMatch from 'path-match';

const route = pathMatch();

export default function (nexti18next: NextI18Next) {
    const {config, i18n} = nexti18next;
    const {allLanguages, ignoreRoutes, localeSubpaths, publicPath} = config;

    const isI18nRoute = (req: Request) => ignoreRoutes?.every(x => !req.url.startsWith((publicPath || '') + x));
    const localeSubpathRoute = route(`/:subpath(${Object.values(localeSubpaths || {}).join('|')})(.*)`);

    const middleware = [];

    /*
        If not using server side language detection,
        we need to manually set the language for
        each request
    */
    if (!config.serverLanguageDetection) {
        middleware.push((req: Request, _res: Response, next: NextFunction) => {
            if (isI18nRoute(req)) {
                req.lng = config.defaultLanguage;
            }
            next();
        });
    }

    /*
        This does the bulk of the i18next work
    */
    middleware.push(i18nextMiddleware.handle(i18n));

    /*
        This does the locale subpath work
    */
    middleware.push((req: Request, res: Response, next: NextFunction) => {
        if (isI18nRoute(req) && req.i18n) {
            let url = publicPath ? req.url.replace(publicPath, '') : req.url;
            if (!url) {
                url = '/';
            }
            let currentLng = lngFromReq(req);
            const currentLngSubpath = subpathFromLng(config, currentLng);
            const currentLngRequiresSubpath = subpathIsRequired(config, currentLng || '');
            const currentLngSubpathIsPresent = subpathIsPresent(url, currentLngSubpath);

            const lngFromCurrentSubpath = allLanguages.find((l: string) =>
                subpathIsPresent(url, subpathFromLng(config, l))
            );

            if (lngFromCurrentSubpath !== undefined && lngFromCurrentSubpath !== currentLng) {
                /*
                    If a user has hit a subpath which does not
                    match their language, give preference to
                    the path, and change user language.
                */
                req.i18n.changeLanguage(lngFromCurrentSubpath);
                currentLng = lngFromCurrentSubpath;
            } else if (currentLngRequiresSubpath && !currentLngSubpathIsPresent) {
                /*
                    If a language subpath is required and
                    not present, prepend correct subpath
                */
                return redirectWithoutCache(res, (publicPath || '') + addSubpath(url, currentLngSubpath));
            }

            /*
                If a locale subpath is present in the URL,
                modify req.url in place so that NextJs will
                render the correct route
            */
            if (typeof lngFromCurrentSubpath === 'string') {
                const params = localeSubpathRoute(url);
                if (params !== false) {
                    const {subpath} = params;
                    req.query = {...req.query, subpath, lng: currentLng};
                    req.url = (publicPath || '') + removeSubpath(url, subpath);
                }
            }
        }

        next();
    });

    return middleware;
}
