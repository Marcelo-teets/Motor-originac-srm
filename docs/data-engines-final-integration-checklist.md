# Data Engines Final Integration Checklist

## Existing files to patch next
- `backend/src/lib/connectors.ts`
- `backend/src/modules/data-capture/dataCaptureEngine.ts`
- `backend/src/modules/data-enrichment/dataTreatmentEngine.ts`
- `backend/src/routes/abmWarRoomRouter.ts`

## Helpers already available
- `documentFingerprint.ts`
- `urlNormalization.ts`
- `feedItemNormalizer.ts`
- `crawlPlanBuilder.ts`
- `contentSectionsExtractor.ts`
- `pageClassifier.ts`
- `companyAliasBuilder.ts`
- `sourceDocumentMapper.ts`
- `engineRequestFactory.ts`
- `runSummaryBuilder.ts`
- `sourceHealthHeuristics.ts`

## Next patch objectives
1. use fingerprint for source document dedupe
2. use URL normalization in feed handling
3. use crawl plan for company-site traversal
4. use alias builder inside enrichment
5. use source document mapper before persistence
6. use request factory in capture/enrichment routes
