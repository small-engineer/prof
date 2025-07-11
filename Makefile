# Makefile

DIST_DIR := dist
SRC_DIR := src

CSS_SOURCES := \
  $(SRC_DIR)/assets/styles/base.css \
  $(shell find $(SRC_DIR)/assets/styles/blocks/layout -type f -name "*.css" | sort) \
  $(shell find $(SRC_DIR)/assets/styles/blocks/profile -type f -name "*.css" | sort)

DIST_CSS := $(DIST_DIR)/assets/styles/main.css

PAGES := $(wildcard $(SRC_DIR)/assets/pages/*)
SCRIPTS := $(shell find $(SRC_DIR)/assets/scripts -type f -name "*.js")
IMAGES := $(wildcard $(SRC_DIR)/assets/images/*)
COMPONENTS := $(wildcard $(SRC_DIR)/assets/components/*)

all: help

help:
	@echo "Usage: make [dev|build|clean|re|help]"
	@echo ""
	@echo "Targets:"
	@echo "  dev    Start development server"
	@echo "  build  Build the project to dist/"
	@echo "  clean  Remove dist/ directory"
	@echo "  re     Clean and build again"
	@echo "  help   Show this help message"

dev:
	@echo "[DEV] Starting development server..."
	@if ! command -v python3 >/dev/null; then \
		echo "[ERROR] python3 is required but not installed."; \
		exit 1; \
	fi
	@cd $(SRC_DIR) && python3 ../server.py

build:
	@echo "[BUILD] Cleaning old dist..."
	@rm -rf $(DIST_DIR)
	@mkdir -p $(DIST_DIR)

	@echo "[BUILD] Copying HTML and static assets..."
	@cp src/index.html             $(DIST_DIR)/
	@cp src/404.html             $(DIST_DIR)/
	@mkdir -p $(DIST_DIR)/assets/pages
	@mkdir -p $(DIST_DIR)/assets/images
	@mkdir -p $(DIST_DIR)/assets/components
	@cp -r $(SRC_DIR)/assets/pages/* $(DIST_DIR)/assets/pages/
	@cp -r $(SRC_DIR)/assets/images/* $(DIST_DIR)/assets/images/
	@cp -r $(SRC_DIR)/assets/components/* $(DIST_DIR)/assets/components/

	@echo "[BUILD] Merging CSS..."
	@mkdir -p $(DIST_DIR)/assets/styles
	@cat $(CSS_SOURCES) > $(DIST_DIR)/assets/styles/main.css

	@echo "[BUILD] Bundling JS with esbuild..."
	@npx esbuild \
		src/assets/scripts/main.js \
		--bundle \
		--outdir=$(DIST_DIR)/assets/scripts \
		--public-path=/assets/scripts \
		--format=esm \
		--minify

$(DIST_DIR)/assets/images/%: $(SRC_DIR)/assets/images/% | $(DIST_DIR)/assets/images
	@cp $< $@

$(DIST_DIR)/assets/styles/main.css: $(CSS_SOURCES) | $(DIST_DIR)/assets/styles
	@echo "[BUILD] Merging CSS into main.css..."
	@cat $(CSS_SOURCES) > $@

clean:
	@echo "[CLEAN] Removing dist/..."
	@rm -rf $(DIST_DIR)
	@echo "[CLEAN] Done."

re: clean build
	@echo "[RE] Rebuild complete."


.PHONY: all dev build clean re help
