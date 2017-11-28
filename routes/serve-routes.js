const logger = require('winston');
const { getClaimId, getChannelContents, getLocalFileRecord, getClaimRecord } = require('../controllers/serveController.js');
const serveHelpers = require('../helpers/serveHelpers.js');
const { handleRequestError } = require('../helpers/errorHandlers.js');
const db = require('../models');

const SERVE = 'SERVE';
const SHOW = 'SHOW';
const SHOWLITE = 'SHOWLITE';
const CLAIM_ID_CHAR = ':';
const CHANNEL_CHAR = '@';
const CLAIMS_PER_PAGE = 10;
const NO_CHANNEL = 'NO_CHANNEL';
const NO_CLAIM = 'NO_CLAIM';
const NO_FILE = 'NO_FILE';

function isValidClaimId (claimId) {
  return ((claimId.length === 40) && !/[^A-Za-z0-9]/g.test(claimId));
}

function isValidShortId (claimId) {
  return claimId.length === 1;  // it should really evaluate the short url itself
}

function isValidShortIdOrClaimId (input) {
  return (isValidClaimId(input) || isValidShortId(input));
}

function isUriAChannel (name) {
  return (name.charAt(0) === CHANNEL_CHAR);
}

function returnChannelNameFromUri (uri) {
  if (uri.indexOf(CLAIM_ID_CHAR) !== -1) {
    return uri.substring(0, uri.indexOf(CLAIM_ID_CHAR));
  }
  return uri;
}

function returnChannelIdFromUri (uri) {
  if (uri.indexOf(CLAIM_ID_CHAR) !== -1) {
    return uri.substring(uri.indexOf(CLAIM_ID_CHAR) + 1);
  }
  return null;
}

function getPage (query) {
  if (query.p) {
    return parseInt(query.p);
  }
  return 1;
}

function extractPageFromClaims (claims, pageNumber) {
  if (!claims) {
    return [];  // if no claims, return this default
  }
  logger.debug('claims is array?', Array.isArray(claims));
  logger.debug(`pageNumber ${pageNumber} is number?`, Number.isInteger(pageNumber));
  const claimStartIndex = (pageNumber - 1) * CLAIMS_PER_PAGE;
  const claimEndIndex = claimStartIndex + 10;
  const pageOfClaims = claims.slice(claimStartIndex, claimEndIndex);
  return pageOfClaims;
}

function determineTotalPages (claims) {
  if (!claims) {
    return 0;
  } else {
    const totalClaims = claims.length;
    if (totalClaims < CLAIMS_PER_PAGE) {
      return 1;
    }
    const fullPages = Math.floor(totalClaims / CLAIMS_PER_PAGE);
    const remainder = totalClaims % CLAIMS_PER_PAGE;
    if (remainder === 0) {
      return fullPages;
    }
    return fullPages + 1;
  }
}

function determinePreviousPage (currentPage) {
  if (currentPage === 1) {
    return null;
  }
  return currentPage - 1;
}

function determineNextPage (totalPages, currentPage) {
  if (currentPage === totalPages) {
    return null;
  }
  return currentPage + 1;
}

function determineTotalClaims (result) {
  if (!result.claims) {
    return 0;
  }
  return result.claims.length;
}

function returnOptionsForChannelPageRendering (result, query) {
  const totalPages = determineTotalPages(result.claims);
  const paginationPage = getPage(query);
  const options = {
    layout        : 'channel',
    channelName   : result.channelName,
    longChannelId : result.longChannelId,
    shortChannelId: result.shortChannelId,
    claims        : extractPageFromClaims(result.claims, paginationPage),
    previousPage  : determinePreviousPage(paginationPage),
    currentPage   : paginationPage,
    nextPage      : determineNextPage(totalPages, paginationPage),
    totalPages    : totalPages,
    totalResults  : determineTotalClaims(result),
  };
  return options;
}

function sendChannelContentsToClient (result, query, res) {
  if (result === NO_CHANNEL) {              // (a) no channel found
    res.status(200).render('noChannel');
  } else {                                  // (b) channel found
    const options = returnOptionsForChannelPageRendering(result, query);
    res.status(200).render('channel', options);
  }
}

function showChannelPageToClient (uri, originalUrl, ip, query, res) {
  let channelName = returnChannelNameFromUri(uri);
  logger.debug('channel name =', channelName);
  let channelId = returnChannelIdFromUri(uri);
  logger.debug('channel Id =', channelId);
  // 1. retrieve the channel contents
  getChannelContents(channelName, channelId)
    .then(result => {
      sendChannelContentsToClient(result, query, res);
    })
    .catch(error => {
      handleRequestError('serve', originalUrl, ip, error, res);
    });
}

function determineResponseType (uri, headers) {
  let responseType;
  if (uri.indexOf('.') !== -1) {
    responseType = SERVE;
    if (headers['accept'] && headers['accept'].split(',').includes('text/html')) {
      responseType = SHOWLITE;
    }
  } else {
    responseType = SHOW;
  }
  return responseType;
}

function determineName (uri) {
  /* patch because twitter player preview adds '>' before file extension.  Note: put this inside determineName()? */
  if (uri.indexOf('>') !== -1) {
    return uri.substring(0, uri.indexOf('>'));
  }
  /* end patch */
  if (uri.indexOf('.') !== -1) {
    return uri.substring(0, uri.indexOf('.'));
  }
  return uri;
}

function showAssetToClient (claimId, name, res) {
    // check for local file info, resolve the claim, and get the short
  return Promise
      .all([getClaimRecord(claimId, name), db.Claim.getShortClaimIdFromLongClaimId(claimId, name)])
      .then(([claimInfo, shortClaimId]) => {
        logger.debug('claimInfo:', claimInfo);
        logger.debug('shortClaimId:', shortClaimId);
        return serveHelpers.showFile(claimInfo, shortClaimId, res);
      })
      .catch(error => {
        throw error;
      });
}

function showPlainAssetToClient (claimId, name, res) {
  return Promise
      .all([getClaimRecord(claimId, name), db.Claim.getShortClaimIdFromLongClaimId(claimId, name)])
      .then(([claimInfo, shortClaimId]) => {
        logger.debug('claimInfo:', claimInfo);
        logger.debug('shortClaimId:', shortClaimId);
        return serveHelpers.showFileLite(claimInfo, shortClaimId, res);
      })
      .catch(error => {
        throw error;
      });
}

function serveAssetToClient (claimId, name, res) {
  return getLocalFileRecord(claimId, name)
      .then(fileInfo => {
        logger.debug('fileInfo:', fileInfo);
        if (fileInfo === NO_FILE) {
          res.status(307).redirect(`/api/get_claim/${name}/${claimId}`);
        } else {
          return serveHelpers.serveFile(fileInfo, claimId, name, res);
        }
      })
      .catch(error => {
        throw error;
      });
}

function showOrServeAsset (responseType, claimId, claimName, res) {
  switch (responseType) {
    case SHOW:
      return showAssetToClient(claimId, claimName, res);
    case SHOWLITE:
      return showPlainAssetToClient(claimId, claimName, res);
    case SERVE:
      return serveAssetToClient(claimId, claimName, res);
    default:
      break;
  }
}

function flipClaimNameAndIdForBackwardsCompatibility (identifier, name) {
  if (isValidShortIdOrClaimId(name) && !isValidShortIdOrClaimId(identifier)) {
    const tempName = name;
    name = identifier;
    identifier = tempName;
  }
  return [identifier, name];
}

function logRequestData (responseType, claimName, channelName, claimId) {
  logger.debug('responseType ===', responseType);
  logger.debug('claim name === ', claimName);
  logger.debug('channel name ===', channelName);
  logger.debug('claim id ===', claimId);
}

module.exports = (app) => {
  // route to serve a specific asset
  app.get('/:identifier/:name', ({ headers, ip, originalUrl, params }, res) => {
    let identifier = params.identifier;  // identifier will either be a @channel, @channel:channelId, or claimId
    let name = params.name;  // name will be example or example.ext
    [identifier, name] = flipClaimNameAndIdForBackwardsCompatibility(identifier, name); // patch for backwards compatability with spee.ch/name/claim_id
    let channelName = null;
    let claimId = null;
    let channelId = null;
    let responseType = determineResponseType(name, headers);
    let claimName = determineName(name);
    // parse identifier for whether it is a channel, short url, or claim_id
    if (isUriAChannel(identifier)) {
      channelName = returnChannelNameFromUri(identifier);
      channelId = returnChannelIdFromUri(identifier);
    } else {
      claimId = identifier;
    }
    // consolidated logging
    logRequestData(responseType, claimName, channelName, claimId);
    // get the claim id
    getClaimId(channelName, channelId, claimName, claimId)
    .then(fullClaimId => {
      if (fullClaimId === NO_CLAIM) {
        return res.status(200).render('noClaim');
      } else if (fullClaimId === NO_CHANNEL) {
        return res.status(200).render('noChannel');
      }
      showOrServeAsset(responseType, fullClaimId, claimName, res);
    })
    .catch(error => {
      handleRequestError('serve', originalUrl, ip, error, res);
    });
  });
  // route to serve the winning asset at a claim
  app.get('/:uri', ({ headers, ip, originalUrl, params, query }, res) => {
    // parse name param
    let uri = params.uri;
    // (a) handle channel requests
    if (isUriAChannel(uri)) {
      showChannelPageToClient(uri, originalUrl, ip, query, res);
    // (b) handle stream requests
    } else {
      let responseType = determineResponseType(uri, headers);
      let claimName = determineName(uri);
      // consolidated logging
      logRequestData(responseType, claimName, null, null);
      // get the claim id
      getClaimId(null, null, claimName, null)
        .then(fullClaimId => {
          if (fullClaimId === NO_CLAIM) {
            return res.status(200).render('noClaim');
          }
          showOrServeAsset(responseType, fullClaimId, claimName, res);
        })
        .catch(error => {
          handleRequestError(responseType, originalUrl, ip, error, res);
        });
    }
  });
};
