
REPORTER = spec

test:
	@mocha --reporter $(REPORTER)

test-expresso:
	@expresso --serial -I lib

test-cov: lib-cov
	@CONNECT_MONGO_COV=1 $(MAKE) test REPORTER=html-cov > coverage.html

lib-cov:
	@jscoverage lib lib-cov

.PHONY: test test-cov
