import { rspack, type Configuration as RspackConfiguration } from '@rspack/core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDir = path.dirname(fileURLToPath(import.meta.url))

const config: RspackConfiguration = {
	devtool: false,
	entry: path.join(outputDir, 'gallery-client-entry.js'),
	mode: 'production',
	optimization: {
		runtimeChunk: false,
		splitChunks: false,
	},
	output: {
		clean: false,
		filename: 'gallery-client.js',
		path: outputDir,
	},
	resolve: {
		extensions: ['.js', '.json'],
	},
	target: 'web',
}

await new Promise<void>((resolve, reject) => {
	rspack(config, (error, stats) => {
		if (error) {
			reject(error)
			return
		}
		if (stats?.hasErrors()) {
			reject(new Error(stats.toString({ colors: true, errorDetails: true })))
			return
		}
		resolve()
	})
})
