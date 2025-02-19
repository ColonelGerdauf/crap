/**
 * @name DateViewer
 * @author Arashiryuu
 * @version 1.0.6
 * @description Displays the current date, weekday, and time.
 * @authorId 238108500109033472
 * @authorLink https://github.com/Arashiryuu
 * @website https://github.com/Arashiryuu/crap
 * @source https://github.com/Arashiryuu/crap/blob/master/BdApi/DateViewer/DateViewer.plugin.js
 */

// @ts-check
/* global BdApi */

/**
 * @typedef Plugin
 * @type {!import('./types').Plugin}
 */

/**
 * @typedef MetaData
 * @type {!import('./types').MetaData}
 */

/**
 * @typedef Logger
 * @type {!import('./types').Logger}
 */

/**
 * @typedef PromiseState
 * @type {!import('./types').PromiseStateManager}
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

/**
 * @param {!MetaData} meta
 * @returns {!Plugin}
 */
module.exports = (meta) => {
	// @ts-ignore
	const Api = new BdApi(meta.name);
	const { UI, DOM, Data, React, Utils, Themes, Plugins, Patcher, Webpack, ReactDOM, ReactUtils, ContextMenu } = Api;
	const { createElement: ce, useRef, useMemo, useState, useEffect, useReducer, useCallback, useLayoutEffect } = React;
	const { render, findDOMNode, unmountComponentAtNode: unmount } = ReactDOM;
	const { getModule, waitForModule } = Webpack;

	const Filters = Object.create(Webpack.Filters);
	Object.assign(Filters, {
		byId: (id) => (...m) => m.pop() === String(id),
		byName: (name) => Filters.byDisplayName(name),
		byStore: (name) => (m) => m?._dispatchToken && m?.getName() === name,
		byProtos: Filters.byPrototypeFields
	});

	const raf = requestAnimationFrame;
	const has = Object.prototype.hasOwnProperty;
	const toString = Object.prototype.toString;

	const { inspect } = getModule(Filters.byProps('inspect', 'promisify'));

	/* Utility */

	/**
	 * @param {!object} instance
	 * @returns {void}
	 */
	const applyBinds = (instance) => {
		const methods = Object.getOwnPropertyNames(instance).filter((name) => typeof instance[name] === 'function');
		for (const method of methods) instance[method] = instance[method].bind(instance);
	};

	/**
	 * @type {!PromiseState}
	 */
	const promises = {
		state: { cancelled: false },
		cancel () { this.state.cancelled = true; },
		restore () { this.state.cancelled = false; }
	};
	applyBinds(promises);

	/**
	 * Creates clean objects with a `Symbol.toStringTag` value describing the object.
	 * @param {!string} value
	 * @returns {!object}
	 */
	const _Object = (value = 'NullObject') => Object.create(null, {
		[Symbol.toStringTag]: {
			enumerable: false,
			value
		}
	});

	/**
	 * @type {!Logger}
	 */
	// @ts-ignore
	const Logger = _Object('Logger');
	{
		/**
		 * @param {!string} label 
		 * @returns {!string[]}
		 */
		const useParts = (label) => [
			`%c[${label}] \u2014%c`,
			'color: #59f;',
			'',
			new Date().toUTCString()
		];
		for (const level of ['log', 'info', 'warn', 'debug', 'error']) {
			Logger[level] = function () {
				console.groupCollapsed(...useParts(meta.name));
				console[level].apply(null, arguments);
				console.groupEnd();
			};
		}
		Logger.dir = (...n) => {
			console.groupCollapsed(...useParts(meta.name));
			for (const item of n) console.dir(item);
			console.groupEnd();
		};
		// @ts-ignore
		Logger.ins = (...n) => {
			const inspected = n.map((item) => inspect(item, { colors: true }));
			console.groupCollapsed(...useParts(meta.name));
			for (const item of inspected) console.log(item);
			console.groupEnd();
		};
		applyBinds(Logger);
	}

	/**
	 * @param {!object} obj
	 * @param {!string} path
	 * @returns {*}
	 */
	const getProp = (obj, path) => path.split(/\s?\.\s?/g).reduce((o, prop) => o && o[prop], obj);

	/**
	 * Generates a DOM element.
	 * @param {!string} type
	 * @returns {!(HTMLElement | SVGElement)}
	 */
	const getElement = (type = 'div') => {
		const e = document.createElement(type);
		if (e instanceof HTMLUnknownElement) return document.createElementNS('http://www.w3.org/2000/svg', type);
		return e;
	};

	/**
	 * @param {!string} key 
	 * @returns {!boolean}
	 */
	const isEvent = (key) => key.slice(0, 2) === 'on' && key[2] === key[2].toUpperCase();

	/**
	 * @param {!string} key
	 * @returns {!boolean}
	 */
	const isDataAttr = (key) => key.startsWith('data') && key.toLowerCase() !== key;

	/**
	 * @param {!string} key
	 * @returns {!string}
	 */
	const normalizeEvent = (key) => key === 'doubleclick'
		? 'dblclick'
		: key;

	/**
	 * @param {!string} key
	 * @returns {!string}
	 */
	const normalizeDataAttr = (key) => key.replace(/([A-Z]{1})/g, '-$1').toLowerCase();

	/**
	 * A `document.createElement` helper function.
	 * @param {!string} type 
	 * @param {!object} props
	 * @param {!(string | Node)[]} [children]
	 * @returns {!(HTMLElement | SVGElement)}
	 */
	const create = (type = 'div', props = {}, ...children) => {
		if (typeof type !== 'string') type = 'div';
		const e = getElement(type);

		if (toString.call(props) !== '[object Object]') {
			if (children.length) e.append(...children);
			return e;
		}

		if (!has.call(props, 'children') && children.length) {
			e.append(...children);
		}

		for (const key of Object.keys(props)) {
			switch (key) {
				case 'text': {
					e.textContent = props[key];
					break;
				}
				case 'style': {
					if (typeof props[key] === 'string') {
						e.setAttribute(key, props[key]);
						break;
					}
					try {
						Object.assign(e[key], props[key]);
					} catch (fail) {
						Logger.error(fail);
					}
					break;
				}
				case 'htmlFor': {
					e.setAttribute('for', props[key]);
					break;
				}
				case 'className': {
					e.classList.add(...props[key].split(' '));
					break;
				}
				case 'classList':
				case 'classes': {
					if (!Array.isArray(props[key])) props[key] = [props[key]];
					e.classList.add(...props[key]);
					break;
				}
				case 'children': {
					if (!Array.isArray(props[key])) props[key] = [props[key]];
					e.append.apply(props[key]);
					break;
				}
				default: {
					if (isEvent(key)) {
						const event = normalizeEvent(key.slice(2).toLowerCase());
						e.addEventListener(event, props[key]);
						break;
					}
					if (isDataAttr(key)) {
						const attr = normalizeDataAttr(key);
						e.setAttribute(attr, props[key]);
						break;
					}
					e.setAttribute(key, props[key]);
					break;
				}
			}
		}

		// @ts-ignore
		e.$$props = props;
		return e;
	};

	/**
	 * @type {!Plugin}
	 */
	const plugin = _Object(meta.name);

	/* Setup */

	/**
	 * Converts a classname string into a class selector.
	 * @param {!string} className
	 * @returns {!string}
	 */
	const toSelector = (className) => `.${className.split(' ').join('.')}`;

	const memberListClasses = getModule(Filters.byProps('members', 'container'));
	/**
	 * Current selector for the member-list.
	 */
	const memberListSelector = toSelector(memberListClasses.members);

	/**
	 * CSS formatter helper.
	 * @param {!TemplateStringsArray} ss
	 * @returns {!string}
	 */
	const css = (ss, ...vars) => {
		let string = '';
		for (let i = 0, len = ss.length; i < len; i++) string += `${ss[i]}${vars[i] ?? ''}`;
		return string.split(/\s+/g).join(' ').trim();
	};

	const style = css`
		#dv-mount {
			background-color: #2f3136;
			bottom: 0;
			box-sizing: border-box;
			display: flex;
			height: 95px !important;
			justify-content: center;
			position: fixed;
			width: 240px;
			z-index: 1;
		}
		#dv-main {
			--gap: 20px;
			background-color: transparent;
			border-top: 1px solid hsla(0, 0%, 100%, .04);
			box-sizing: border-box;
			color: #fff;
			display: flex;
			flex-direction: column;
			height: 100%;
			line-height: 20px;
			justify-content: center;
			text-align: center;
			text-transform: uppercase;
			width: calc(100% - var(--gap) * 2);
		}
		#dv-main .dv-date {
			font-size: small;
			opacity: .6;
		}
		.theme-light #dv-mount {
			background-color: #f3f3f3;
		}
		.theme-light #dv-main {
			border-top: 1px solid #e6e6e6;
			color: #737f8d;
		}
		${memberListSelector} {
			margin-bottom: 95px;
		}
		/* Error Component */
		.${meta.name}-error {
			/* width: 100vmin;
			height: 100%;
			display: flex;
			place-content: center;
			place-items: center;
			flex-flow: wrap row; */
			position: fixed;
			bottom: 3dvh;
			color: red;
			font-size: 18px;
			font-weight: 600;
			text-shadow: 0 0 1px black, 0 0 2px black, 0 0 3px black,
						 0 0 1px black, 0 0 2px black, 0 0 3px black,
						 0 0 1px black, 0 0 2px black, 0 0 3px black;
		}
	`;

	/* Settings */
	
	const defaults = {
		hour12: false,
		displaySeconds: true
	};
	let settings = Utils.extend({}, defaults);

	/**
	 * Discord Components
	 */
	const BulkModule = getModule((m) => m?.Tooltip && m?.Text);
	const Discord = {
		Switch: getModule(Filters.byStrings('.value', '.disabled', '.onChange', '.tooltipNote'), { searchExports: true }),
		TooltipWrapper: BulkModule.Tooltip,
		ThemeContext: BulkModule.ThemeContextProvider
	};

	/**
	 * Custom hook wrapper for forceUpdate functionality.
	 * @returns {!React.DispatchWithoutAction}
	 */
	const useForceUpdate = () => useReducer((x) => x + 1, 0).pop();

	/**
	 * Fragment helper, only accepts a child elements array and sets no extra props on the fragment.
	 * @param {!React.ReactNode[]} [children]
	 * @returns {!React.ReactFragment}
	 */
	const Fragment = (children = []) => ce(React.Fragment, { children });

	/**
	 * @param {!object} props
	 * @returns {!React.ReactFragment}
	 */
	const Switch = (props) => {
		const { label = 'Switch label', note = 'Switch note', checked = false, onChange = console.log } = props;

		return ce(Discord.ThemeContext, {
			children: [
				ce(Discord.Switch, {
					...props,
					children: label,
					value: checked,
					hideBorder: false,
					onChange
				})
			]
		});
	};

	/**
	 * @param {!React.ComponentProps<'div'>} props
	 * @returns {!React.ReactHTMLElement<'div'>}
	 */
	const Settings = (props) => {
		const forceUpdate = useForceUpdate();

		return ce('div', {
			key: 'Plugin-Settings',
			children: [
				ce(Switch, {
					label: '12 Hour Time Format',
					note: 'Whether to use 12 hour time, or 24 hour time.',
					checked: settings.hour12,
					/** @param {!boolean} e */
					onChange: (e) => {
						settings.hour12 = e;
					}
				}),
				ce(Switch, {
					label: 'Display Seconds',
					note: 'Toggle for enabling/disabling the seconds on the viewer.',
					checked: settings.displaySeconds,
					/** @param {!boolean} e */
					onChange: (e) => {
						settings.displaySeconds = e;
					}
				})
			],
			/** @param {!React.FormEvent<HTMLDivElement>} e */
			onChange: (e) => {
				if (typeof props.onChange === 'function') props.onChange(e);
				forceUpdate();
			}
		});
	};

	/**
	 * Root element for plugin settings.
	 */
	const settingRoot = create('div', { id: `__${meta.name}-react-settings-root__` });

	/**
	 * Indicates whether a node was removed.
	 * @param {!NodeListOf<Node>} removed
	 * @param {!Node} root
	 * @returns {!boolean}
	 */
	const isCleared = (removed, root) => {
		if (!removed.length) return false;
		// @ts-ignore
		for (let i = 0; i < removed.length; i++) {
			const node = removed[i];
			if (node.contains(root)) return true;
		}
		return false;
	};

	/* Setup Cont. */

	const getData = () => {
		const { hour12, displaySeconds } = settings;
		const d = new Date();
		const l = document.documentElement.lang;
		const timeStyle = displaySeconds
			? 'long'
			: 'short';
		let time = (new Intl.DateTimeFormat(l, { timeStyle, hour12 })).format();
		if (displaySeconds) {
			time = time.replace(/(GMT|BST|UTC)(\+\d{1,2})?/ig, '');
		}
		return {
			time,
			date: d.toLocaleDateString(l, { day: '2-digit', month: '2-digit', year: 'numeric' }),
			weekday: d.toLocaleDateString(l, { weekday: 'long' })
		};
	};

	/**
	 * Interval hook.
	 * @param {!VoidFunction} callback
	 * @param {!number} [time]
	 */
	const useInterval = (callback, time = 1000) => {
		/**
		 * @type {!React.RefObject<VoidFunction>}
		 */
		const cbRef = useRef(callback);

		useEffect(() => {
			const id = setInterval(() => cbRef.current(), time);
			return () => clearInterval(id);
		}, [time]);
	};

	/**
	 * AnimationFrame hook.
	 * @param {!VoidFunction} callback
	 */
	const useAnimationFrame = (callback) => {
		/**
		 * @type {!React.RefObject<VoidFunction>}
		 */
		const cbRef = useRef(callback);
		/**
		 * @type {!React.MutableRefObject<number>}
		 */
		const frame = useRef();

		const animate = useCallback((now) => {
			cbRef.current();
			frame.current = raf(animate);
		}, []);

		useLayoutEffect(() => {
			frame.current = raf(animate);
			return () => frame.current && cancelAnimationFrame(frame.current);
		}, []);
	};

	const ErrorBoundary = class ErrorBoundary extends React.Component {
		state = { hasError: false };

		/**
		 * @param {!Error} error
		 */
		static getDerivedStateFromError (error) {
			return { hasError: true };
		}

		/**
		 * @param {!Error} error
		 * @param {!React.ErrorInfo} info
		 */
		componentDidCatch (error, info) {
			Logger.error(error, info);
		}

		render () {
			if (this.state.hasError) return ce(Discord.TooltipWrapper, {
				text: 'See console for details.',
				children: (props) => {
					return ce('div', {
						className: `${meta.name}-error`,
						children: [
							'Component Error'
						],
						...props
					});
				},
				...Discord.TooltipWrapper.defaultProps
			});
			// @ts-ignore
			return this.props.children;
		}
	};

	const WrapBoundary = (Original) => (props) => ce(ErrorBoundary, null, ce(Original, props));

	const dataZero = getData();
	/**
	 * @returns {!React.ReactHTMLElement<'div'>}
	 */
	const Viewer = () => {
		const [state, setState] = useState(getData);
		const update = useCallback(() => setState(getData));
		/**
		 * @type {!React.ElementRef<'div'>}
		 */
		const ref = useRef();

		useInterval(update);

		return ce('div', {
			id: 'dv-mount',
			children: [
				ce('div', {
					id: 'dv-main',
					ref: ref,
					key: 'dv_viewer_main',
					children: [
						ce('span', { key: 'date_viewer_time', className: 'dv-time' }, state.time),
						ce('span', { key: 'date_viewer_date', className: 'dv-date' }, state.date),
						ce('span', { key: 'date_viewer_weekday', className: 'dv-weekday' }, state.weekday)
					]
				})
			]
		});
	};
	Viewer.Wrapped = WrapBoundary(Viewer);

	const viewRoot = create('div', { id: 'dv-mount' });
	const viewMain = create('div', { id: 'dv-main' });
	const time = create('span', { class: 'dv-time' }, dataZero.time);
	const date = create('span', { class: 'dv-date' }, dataZero.date);
	const weekday = create('span', { class: 'dv-weekday' }, dataZero.weekday);
	viewMain.append(time, date, weekday);
	viewRoot.append(viewMain);

	const removeRoot = () => viewRoot.isConnected && viewRoot.remove();
	const appendRoot = () => {
		const list = document.querySelector(memberListSelector);
		if (!list || viewRoot.isConnected) return;
		list.appendChild(viewRoot);
	};

	const setData = () => {
		const { time: t, date: d, weekday: w } = getData();
		if (time.textContent !== t) time.textContent = t;
		if (date.textContent !== d) date.textContent = d;
		if (weekday.textContent !== w) weekday.textContent = w;
	};

	const ref = { current: null };
	const teeUpdates = () => {
		setData();
		ref.current = raf(teeUpdates);
	};
	const cancelUpdates = () => ref.current && cancelAnimationFrame(ref.current);

	const connect = () => {
		render(ce(Viewer.Wrapped, { key: `${meta.name}-Boundary` }), viewRoot);
	};

	const disconnect = () => {
		unmount(viewRoot);
	};

	/**
	 * @param {!PromiseState['state']} state
	 */
	const patchMemberList = (state) => {
		if (!BulkModule.ListThin || !BulkModule.ScrollerThin || state.cancelled) return;
		const validateAndPush = (type, value) => {
			if (type !== 'members') return value;
			const ret = Array.isArray(value) ? value : [value];
			if (!ret.length) return ret;
			if (ret.find((fiber) => fiber?.key === `${meta.name}-Boundary`)) return ret;
			ret.push(ce(Viewer.Wrapped, { key: `${meta.name}-Boundary` }));
			return ret;
		};
		
		Patcher.after(BulkModule.ListThin, 'render', (that, args, value) => {
			const type = value.props?.['data-list-id']?.split('-')[0];
			return validateAndPush(type, value);
		});

		// Group DMs
		Patcher.after(BulkModule.ScrollerThin, 'render', (that, args, value) => {
			const type = value.props?.className?.split('-')[0];
			return validateAndPush(type, value);
		});
	};

	const onStart = () => {
		DOM.addStyle(style);
		// appendRoot();
		// connect(); // teeUpdates();
		patchMemberList(promises.state);
	};

	const onStop = () => {
		DOM.removeStyle();
		// cancelUpdates();
		// removeRoot();
		// disconnect();
		Patcher.unpatchAll();
	};

	const loadSettings = () => {
		settings = Utils.extend({}, defaults, Data.load('settings'));
	};

	const saveSettings = () => {
		Data.save('settings', settings);
	};

	/* Build */

	Object.assign(plugin, {
		start () {
			promises.restore();
			loadSettings();
			raf(onStart);
		},
		stop () {
			promises.cancel();
			raf(onStop);
		},
		getSettingsPanel () {
			const panel = ce(Settings, {
				onChange: saveSettings
			});
			render(panel, settingRoot);
			return settingRoot;
		},
		/**
		 * Global observer provided by BD.
		 * @param {!MutationRecord} change
		 */
		observer (change) {
			if (isCleared(change.removedNodes, settingRoot)) unmount(settingRoot);
			// if (!viewRoot.isConnected) raf(appendRoot);
		}
	});

	/* Finalize */

	applyBinds(plugin);
	return plugin;
};

/*@end@*/
