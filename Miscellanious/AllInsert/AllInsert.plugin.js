/**
 * @name AllInsert
 * @displayName AllInsert
 * @author Arashiryuu
 * @version 1.0.0
 * @description Replaces text and inserts replacement strings.
 * @website https://github.com/Arashiryuu
 * @source https://github.com/Arashiryuu/crap/blob/master/Miscellanious/AllInsert/AllInsert.plugin.js
 */

/*@cc_on
@if (@_jscript)
	
	// Offer to self-install for clueless users that try to run this directly.
	var shell = WScript.CreateObject('WScript.Shell');
	var fs = new ActiveXObject('Scripting.FileSystemObject');
	var pathPlugins = shell.ExpandEnvironmentStrings('%APPDATA%\\BetterDiscord\\plugins');
	var pathSelf = WScript.ScriptFullName;
	// Put the user at ease by addressing them in the first person
	shell.Popup('It looks like you\'ve mistakenly tried to run me directly. \n(Don\'t do that!)', 0, 'I\'m a plugin for BetterDiscord', 0x30);
	if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
		shell.Popup('I\'m in the correct folder already.\nJust reload Discord with Ctrl+R.', 0, 'I\'m already installed', 0x40);
	} else if (!fs.FolderExists(pathPlugins)) {
		shell.Popup('I can\'t find the BetterDiscord plugins folder.\nAre you sure it\'s even installed?', 0, 'Can\'t install myself', 0x10);
	} else if (shell.Popup('Should I copy myself to BetterDiscord\'s plugins folder for you?', 0, 'Do you need some help?', 0x34) === 6) {
		fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
		// Show the user where to put plugins in the future
		shell.Exec('explorer ' + pathPlugins);
		shell.Popup('I\'m installed!\nJust reload Discord with Ctrl+R.', 0, 'Successfully installed', 0x40);
	}
	WScript.Quit();

@else@*/

var AllInsert = (() => {

	/* Setup */

	const config = {
		main: 'index.js',
		info: {
			name: 'AllInsert',
			authors: [
				{
					name: 'Arashiryuu',
					discord_id: '238108500109033472',
					github_username: 'Arashiryuu',
					twitter_username: ''
				}
			],
			version: '1.0.0',
			description: 'Replaces text and inserts replacement strings.',
			github: 'https://github.com/Arashiryuu',
			github_raw: 'https://raw.githubusercontent.com/Arashiryuu/crap/master/Miscellanious/AllInsert/AllInsert.plugin.js'
		}
	};

	/* Utility */

	const log = function() {
		const parts = [
			`%c[${config.info.name}]%c %s`,
			'color: #3A71C1; font-weight: 700;',
			'',
			new Date().toUTCString()
		];
		console.group.apply(null, parts);
		console.log.apply(null, arguments);
		console.groupEnd();
	};

	/* Build */

	const buildPlugin = ([Plugin, Api]) => {
		const { Toasts, Logger, Patcher, Settings, Utilities, DOMTools, ReactTools, ReactComponents, DiscordModules, WebpackModules, DiscordSelectors } = Api;
		const { SettingPanel, SettingGroup, SettingField, RadioGroup, Switch } = Settings;
		const { ComponentDispatch: Dispatcher } = WebpackModules.getByProps('ComponentDispatch');
		const SlateUtils = WebpackModules.getByProps('createState', 'createEmptyState', 'toRichValue'); // WebpackModules.getAllByProps('serialize', 'deserialize')?.find((mod) => Object.keys(mod).length === 2);

		const has = Object.prototype.hasOwnProperty;
		const chat = WebpackModules.getByProps('chat');

		const getChar = (...codes) => codes.map((code) => String.fromCharCode(code)).join('');

		const debounce = (fn, wait = 100, immediate = false) => {
			if (typeof fn !== 'function') fn = function () {};
			let timeout;
			return function () {
				const context = this, args = arguments;
				const later = () => {
					timeout = null;
					if (!immediate) fn.apply(context, args);
				};
				const now = immediate && !timeout;
				clearTimeout(timeout);
				timeout = setTimeout(later, wait);
				if (now) fn.apply(context, args);
			};
		};

		const v = {
			'/-f': 'ƒ',
			'\'\'\'': '```',
			'/>=': '\u2265',
			'/<=': '\u2264',
			'==>': '\u21D2',
			'/!=': '\u2260',
			'/.l': '\u2190',
			'/.u': '\u2191',
			'/.r': '\u2192',
			'/.d': '\u2193',
			'/.>': '\u27A2',
			'/.-': '\u2014',
			'/..': '\u2022',
			'/+-': '\u00B1',
			'/.|>': '\u2BC8',
			'/-tl': '\u21E6',
			'/-tr': '\u21E8',
			'/-tu': '\u21E7',
			'/-td': '\u21E9',
			'/-tn': '\u2605',
			'/-t-db': getChar(55358, 56407),
			'/-t-ub': getChar(55358, 56404),
			'/-t-df': getChar(55358, 56406),
			'/-t-uf': getChar(55358, 56405),
			'/->': getChar(55358, 56402),
			'\\u200b': getChar(8203),
			'/,deg': getChar(176)
		};

		const vKeys = Object.keys(v);
		
		return class AllInsert extends Plugin {
			constructor() {
				super();
				this._css;
				this.promises = {
					state: { cancelled: false },
					cancel() { this.state.cancelled = true; },
					restore() { this.state.cancelled = false; }
				};
			}

			/* Methods */

			onStart() {
				this.promises.restore();
				this.patchTextareaComponent(this.promises.state).catch(console.error);
				Toasts.info(`${this.name} ${this.version} has started!`, { icon: true, timeout: 2e3 });
			}

			onStop() {
				this.promises.cancel();
				Patcher.unpatchAll();
				Toasts.info(`${this.name} ${this.version} has stopped!`, { icon: true, timeout: 2e3 });
			}

			async patchTextareaComponent(state) {
				const EditArea = WebpackModules.getByDisplayName('ChannelEditorContainer');
				if (!EditArea || !SlateUtils || state.cancelled) return;

				Patcher.after(EditArea.prototype, 'render', debounce((that, args, value) => {
					if (!that.props.textValue) return value;

					const textAreaRef = this.getProps(that, 'ref.current');
					if (!textAreaRef) return value;
					
					const hasKey = vKeys.some((key) => that.props.textValue.includes(key));
					if (!hasKey) return value;
					
					let newString = that.props.textValue;
					for (const key of vKeys) newString = this.replaceStrings(newString, key);

					const { textValue, richValue } = SlateUtils.createState(newString);
					that.props.onChange(null, textValue, richValue);
					setImmediate(() => Dispatcher.dispatch('TEXTAREA_FOCUS', null));
					
					return value;
				}, 250));

				this.updateTextArea();
			}

			updateTextArea() {
				const owner = ReactTools.getOwnerInstance(document.querySelector(`.${chat.chat.replace(/\s+/g, '.')} form`));
				if (owner) owner.forceUpdate();
			}

			replaceStrings(string, key) {
				if (!has.call(v, key)) return string;
				return string.replace(key, v[key]);
			}

			/* Utility */

			/**
			 * Function to access properties of an object safely, returns false instead of erroring if the property / properties do not exist.
			 * @name safelyGetNestedProps
			 * @author Zerebos
			 * @param {Object} obj The object we are accessing.
			 * @param {String} path The properties we want to traverse or access.
			 * @returns {*}
			 */
			getProps(obj, path) {
				return path.split(/\s?\.\s?/).reduce((object, prop) => object && object[prop], obj);
			}

			/* Setters */

			set css(style = '') {
				return this._css = style.split(/\s+/g).join(' ').trim();
			}

			/* Getters */

			get [Symbol.toStringTag]() {
				return 'Plugin';
			}

			get css() {
				return this._css;
			}

			get name() {
				return config.info.name;
			}

			get short() {
				let string = '';

				for (let i = 0, len = config.info.name.length; i < len; i++) {
					const char = config.info.name[i];
					if (char === char.toUpperCase()) string += char;
				}

				return string;
			}

			get author() {
				return config.info.authors.map((author) => author.name).join(', ');
			}

			get version() {
				return config.info.version;
			}

			get description() {
				return config.info.description;
			}
		};
	};

	/* Finalize */

	return !global.ZeresPluginLibrary
		? class {
			getName() {
				return this.name.replace(/\s+/g, '');
			}

			getAuthor() {
				return this.author;
			}

			getVersion() {
				return this.version;
			}

			getDescription() {
				return this.description;
			}

			stop() {
				log('Stopped!');
			}

			load() {
				window.BdApi.alert('Missing Library', `The library plugin needed for ${config.info.name} is missing.<br /><br /> <a href="https://betterdiscord.net/ghdl?url=https://raw.githubusercontent.com/rauenzi/BDPluginLibrary/master/release/0PluginLibrary.plugin.js" target="_blank">Click here to download the library!</a>`);
			}

			start() {
				log('Started!');
			}

			/* Getters */

			get [Symbol.toStringTag]() {
				return 'Plugin';
			}

			get name() {
				return config.info.name;
			}

			get short() {
				let string = '';

				for (let i = 0, len = config.info.name.length; i < len; i++) {
					const char = config.info.name[i];
					if (char === char.toUpperCase()) string += char;
				}

				return string;
			}

			get author() {
				return config.info.authors.map((author) => author.name).join(', ');
			}

			get version() {
				return config.info.version;
			}

			get description() {
				return config.info.description;
			}
		}
		: buildPlugin(global.ZeresPluginLibrary.buildPlugin(config));
})();

module.exports = AllInsert;

/*@end@*/
