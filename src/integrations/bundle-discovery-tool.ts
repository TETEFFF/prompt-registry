/**
 * Bundle Discovery LM Tool
 *
 * Registers a Language Model tool that Copilot can invoke to search
 * the local bundle catalog. Fully serverless — searches only cached
 * bundle metadata, never hits the network.
 */

import * as vscode from 'vscode';
import type {
  RegistryManager,
} from '../services/registry-manager';
import {
  Logger,
} from '../utils/logger';

/** The tool ID must match the one declared in package.json contributes.languageModelTools */
export const SEARCH_BUNDLES_TOOL_ID = 'promptRegistry_searchBundles';

/**
 * Input schema for the search tool, validated by VS Code before invocation.
 */
interface SearchBundlesInput {
  query: string;
  tags?: string[];
}

export class BundleDiscoveryTool implements vscode.Disposable {
  private readonly logger: Logger;
  private toolRegistration: vscode.Disposable | undefined;

  constructor(private readonly context: vscode.ExtensionContext, private readonly registryManager: RegistryManager) {
    this.logger = Logger.getInstance();
  }

  /**
   * Register the LM tool with VS Code.
   */
  public activate(): void {
    this.toolRegistration = vscode.lm.registerTool(SEARCH_BUNDLES_TOOL_ID, {
      invoke: async (
        options: vscode.LanguageModelToolInvocationOptions<SearchBundlesInput>,
        _token: vscode.CancellationToken
      ): Promise<vscode.LanguageModelToolResult> => {
        const { query, tags } = options.input;
        this.logger.info(`[BundleDiscoveryTool] Search invoked: query="${query}", tags=${JSON.stringify(tags)}`);

        const bundles = await this.registryManager.searchBundles({
          text: query,
          tags,
          cacheOnly: true, // Never hit the network — pure local search
          limit: 10
        });

        if (bundles.length === 0) {
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(
              'No bundles found matching the query. The user may need to sync their sources first (command: "Prompt Registry: Sync All Sources").'
            )
          ]);
        }

        // Return a concise summary for the LM to reason over
        const results = bundles.map((b) => ({
          id: b.id,
          name: b.name,
          version: b.version,
          description: b.description,
          tags: b.tags,
          author: b.author,
          source: b.sourceId
        }));

        this.logger.info(`[BundleDiscoveryTool] Returning ${results.length} results`);

        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart(JSON.stringify(results, null, 2))
        ]);
      }
    });

    this.context.subscriptions.push(this.toolRegistration);
    this.logger.info('[BundleDiscoveryTool] Registered LM tool: ' + SEARCH_BUNDLES_TOOL_ID);
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.toolRegistration?.dispose();
    this.logger.debug('[BundleDiscoveryTool] Disposed');
  }
}
