// workBench	
// Typeahead based on: https://github.com/corejavascript/typeahead.js/

{
  roam42.wB = {};
	roam42.wB.enabled = false;
	roam42.wB.active  = false;
	roam42.wB.keyboardShortcut = 'ctrl+;';

	roam42.wB.initialize = async ()=> {

		// Default is that CP is enabled, but during testing is turned off.
		if( await roam42.settings.get('workBenchEnabled') != 'on') 
			return;
		else
			roam42.wB.enabled = true;

		roam42.wB.getIsEnabled = ()=> {
			if( Cookies.get('wB_IsEnabled') === 'true' )
				return true
			else 
				return false
		};

		roam42.wB.setIsEnabled = (val)=> {
			if(val == true) 
				Cookies.set('wB_IsEnabled', 'true', { expires: 365 });
			 else 
				Cookies.set('wB_IsEnabled', 'false', { expires: 365 });
		};

		roam42.wB.toggleActiveState = ()=> {
			let currentState = roam42.wB.getIsEnabled();
			roam42.wB.active = !currentState;
			roam42.wB.setIsEnabled( !currentState );
			if(roam42.wB.active)
				roam42.help.displayMessage('workBench activated',5000);
			else
				roam42.help.displayMessage('Bye Bye workBench',5000);
		};

		roam42.wB.active = roam42.wB.getIsEnabled();
		
		roam42.wB.UI_Visible = false;
		roam42.wB.triggeredState = {}; //tracks state of when the CP was triggered
		roam42.wB.triggeredState.activeElementId  = null;
		roam42.wB.triggeredState.selectedNodes  = null;	
		roam42.wB.triggeredState.activeElementSelectionStart = null;
		roam42.wB.triggeredState.activeElementSelectionEnd   = null;
		roam42.wB.keystate = {};			//tracks key state of CP input control
		roam42.wB._sources = [];			//sources for looking up and returning commands
		roam42.wB._commands = [];			//commands visible in CP

		await appendCP_HTML_ToBody();

		$('#roam42-wB-input').typeahead(
			{ hint: true, highlight: true, minLength: 0, autoselect: true },
			{ name: 'basicnav', display: 'display', limit: 10, async: true, 
				source: async (query, syncResults, asyncResults)=> {
									var results = [];
									if( query.length == 0 ) {
											let context = '*'; //default to anywhere
											for await (source of await roam42.wB._sources)
												await source.sourceCallBack(context, query, results);
									} else {
										if(roam42.wB._sources.length>0) {
											let context = '*'; //default to anywhere
											if( roam42.wB.triggeredState.activeElementId != null) context ='-'; //context: textarea
											if( roam42.wB.triggeredState.selectedNodes != null) context ='+'; //context: multiple nodes
											for await (source of await roam42.wB._sources)
												await source.sourceCallBack(context, query, results);
											var enhancedSearch = new JsSearch.Search('display');
											enhancedSearch.searchIndex = new JsSearch.UnorderedSearchIndex();
											enhancedSearch.indexStrategy = new JsSearch.AllSubstringsIndexStrategy();
											enhancedSearch.addDocuments( results );
											enhancedSearch.addIndex('display');
											results = enhancedSearch.search( query )
										}
									}
									asyncResults( results );
				},
				templates: {
					suggestion: (val)=>{
						return '<div style="display: flex">' + 
											'<div style="left:5px;width:22px;"><img height="14px" src="' + val.img + '"></div>' +
											'<div style="width:430px"> ' + val.display + '</div>' + 
										'</div>';
					}
				}											
				}
		);

		// perform command
		$('#roam42-wB-input').bind('typeahead:select',  
				(ev, suggestion)=> {
					$('#roam42-wB-input').typeahead('close');
					roam42.wB.toggleVisible();
					setTimeout( async()=>{
						switch(suggestion.context) {
							case '-': //textarea block edit
								await roam42KeyboardLib.pressEsc(100);
								await roam42.wB.restoreCurrentBlockSelection();
								break;
							case '+': //multipe blocks selected
								break;
						}
						await suggestion.cmd(suggestion);
					},200);
		});

		$('#roam42-wB-input').on('keydown', function(e) { 
			roam42.wB.keystate = e; 
			if(e.key == 'Escape') inputFieldFocusOutListener();
		} );

		$('#roam42-wB-input').on('keyup', function(e) { roam42.wB.keystate = e });
		
		//assign trigger to keyboard
		let shortcut = await roam42.settings.get('workBenchShortcut');
		if(shortcut != null) roam42.wB.keyboardShortcut = shortcut;

		Mousetrap.unbind( roam42.wB.keyboardShortcut ); //do this in case of a reset
		Mousetrap.bind( roam42.wB.keyboardShortcut ,()=>{ 
				if(!roam42.wB.active) return;
				//capture States
				roam42.wB.triggeredState.activeElementId = document.activeElement.type == 'textarea' ? document.activeElement.id : null;
				roam42.wB.triggeredState.activeElementSelectionStart = document.activeElement.selectionStart;
				roam42.wB.triggeredState.activeElementSelectionEnd   = document.activeElement.selectionEnd;
				roam42.wB.triggeredState.selectedNodes = null;
				for(i=0;i<30;i++){
					let lvl = document.querySelectorAll(`.rm-level-${i} > .block-highlight-blue`);	
					if(lvl.length>0) {
						roam42.wB.triggeredState.selectedNodes  = lvl;
						break;
					}
				}
				if(roam42.wB.triggeredState.selectedNodes != null)
					roam42KeyboardLib.pressEsc(100);
				setTimeout(()=>roam42.wB.toggleVisible(),100);
			return false; 
		});

		roam42.wB.restoreCurrentBlockSelection = async()=>{
		 	roam42.common.simulateMouseClick( document.body );
 			await roam42.common.sleep(100);
			roam42.common.simulateMouseClick( document.getElementById( roam42.wB.triggeredState.activeElementId ) );
			await roam42.common.sleep(150);
			document.activeElement.selectionStart = roam42.wB.triggeredState.activeElementSelectionStart;
			document.activeElement.selectionEnd   = roam42.wB.triggeredState.activeElementSelectionEnd;
		};

		let inputFieldFocusOutListener = (e)=>{ 
			if(roam42.wB.UI_Visible) {
				roam42.wB.toggleVisible();
				if( roam42.wB.triggeredState.activeElementId != null ) setTimeout(async ()=>{roam42.wB.restoreCurrentBlockSelection()}, 200);
			}
		};

		let inputFieldKeyListener = (e)=>{ 
			if(roam42.wB.UI_Visible) {
				if(e.keyCode == 9) { //tab key
					console.log('tab')
					event.preventDefault();
				}
			}
		};

		try{ document.querySelector('#roam42-wB-input').removeEventListener('focusout', inputFieldFocusOutListener) } catch(e) {};
		document.querySelector('#roam42-wB-input').addEventListener('focusout', inputFieldFocusOutListener);

		try{ document.querySelector('#roam42-wB-input').removeEventListener('keydown', inputFieldKeyListener) } catch(e) {};
		document.querySelector('#roam42-wB-input').addEventListener('keydown', inputFieldKeyListener);

		roam42.wB.toggleVisible = async ()=> {
			const wControl = document.querySelector('#roam42-wB-container');
			if(roam42.wB.UI_Visible) {
				$(`#roam42-wB-input`).typeahead('val', '');
				wControl.style.visibility='hidden';
			} else {
				wControl.style.visibility='visible';
				document.querySelector('#roam42-wB-input').focus();
			}
			roam42.wB.UI_Visible = !roam42.wB.UI_Visible;
		}
		
		// SOURCES ===================================

			roam42.wB.sourceAdd = async ( sourceName,  callBackFunction )=> {
				//callback receives query and the results object for appending commands
				let source = await roam42.wB._sources.find(source => source.name === sourceName)
				if( source === undefined)
					roam42.wB._sources.push( { name: sourceName, sourceCallBack: callBackFunction } );
				else
					source.sourceCallBack = callBackFunction;
			}

			await roam42.wB.sourceAdd( "SmartBlocks from AnyWhere", async (context, query, results)=> {
				let sbList =  await roam42.smartBlocks.UserDefinedWorkflowsList();
				await roam42.smartBlocks.addCommands( sbList );
				for await (sb of sbList) {
					if( sb['key'].includes('<%GLOBAL%>') ) { 
						let sbCommand = sb['key'].replace('<%GLOBAL%>',''); 
				 		await results.push( { display: sbCommand, img: roam42.host + '/img/wb/sbglobal.png',   context: '*', info: sb, 
						 											cmd: async (cmdInfo)=> roam42.smartBlocks.sbBomb({original: cmdInfo.info}) });
					}
				}
			});

			await roam42.wB.sourceAdd( "SmartBlocks from blocks", async (context, query, results)=>{
				if( context != '-' ) return;
				let sbList =  await roam42.smartBlocks.UserDefinedWorkflowsList();
				await roam42.smartBlocks.addCommands( sbList );
				for await (sb of sbList) {
					if( !sb['key'].includes('<%GLOBAL%>'))
				 		await results.push( { display: sb['key'], img: roam42.host + '/img/wb/sbinwb.png', context: '-', info: sb,
						 											cmd: async (cmdInfo)=> roam42.smartBlocks.sbBomb({original: cmdInfo.info}) });
				}
			});

			await roam42.wB.sourceAdd( "Built-in Roam commands", async (context, query, results)=>{
				let queryLowerCase = query.toLowerCase();
				for await (el of roam42.wB._commands) {
						if( el.context == '*' || el.context == context ) //applies to all contexts, so include
							await results.push(el);
				}
			});

			// Commands ===================================

			// Format for command array
			// display: text displayed in search
			// cmd: command to be run depending on its type
			// context: command works in the defined context
			//				  * = anywhere
			//					- = from a textarea
			//				  + = multipblock selection 
			roam42.wB._commands.push( { 
				display: 'Daily Notes (dn)', 
				cmd: ()=>{ roam42.common.navigateUiTo( roam42.dateProcessing.getRoamDate(new Date()), roam42.wB.keystate.shiftKey ) }, 
				searchText: 'dailynotes dn',
				context: '*',
				img: roam42.host + '/img/wb/command.png'
			});

			roam42.wB.commandAddRunFromAnywhere = async ( textToDisplay, callbackFunction )=> {
				roam42.wB._commands.push( { display: textToDisplay, searchText:textToDisplay.toLowerCase(), 
																		img: roam42.host + '/img/wb/command.png', cmd: callbackFunction, context: '*' } );
			}

			roam42.wB.commandAddRunFromBlock = ( textToDisplay, callbackFunction )=> {
				roam42.wB._commands.push( { display: textToDisplay, searchText:textToDisplay.toLowerCase(), 
																		img: roam42.host + '/img/wb/blocksblock.png', cmd: callbackFunction, context: '-' } );
			}

			roam42.wB.commandAddRunFromMultiBlockSelection = ( textToDisplay, callbackFunction )=> {
				roam42.wB._commands.push( { display: textToDisplay, searchText:textToDisplay.toLowerCase(), 
																		img: roam42.host + '/img/wb/blocksmulti.png', cmd: callbackFunction, context: '+' } );
			}

		// add dependencies
		setTimeout( ()=>{
			roam42.loader.addScriptToPage( 'workBenchPath',  roam42.host + 'ext/workBenchPath.js'   );
			roam42.loader.addScriptToPage( 'workBenchCmd',   roam42.host + 'ext/workBenchCmd.js'   );
		},2000);
	} // End of INITIALIZE


	// HTML Body ===================================
		const appendCP_HTML_ToBody = ()=> {
			$(document.body).append(`
				<div id="roam42-wB-container" style="visibility:hidden">
					<input autocomplete="off" class="typeahead" id="roam42-wB-input" type="text">
				</div>
				<style id="roam42-wB-container-style">
					#roam42-wB-container {
						position: absolute;
						left: 50%;
						top:0px;
						transform: translate(-50%, 0%);
						border: 4px solid #555;
						background-color: #555;
						box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33);
						height: 30px;
						width:450px;
						z-index: 1000;
					}

					#roam42-wB-container .typeahead {
						line-height:12px !important;
						font-size: 10pt !important;
						height: 14px !important;
						border-radius: 0px;
						width: 443px;
						padding-left: 3px !important;
						background-color: #777;
						color: #ddd !important;
					}

					#roam42-wB-container .tt-input:focus {
						border-color: #777 !important;
					}

					#roam42-wB-container .tt-menu {
						background-color: #777;
						border-radius: 0px; !important;
						box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33) !important;
						color: #ddd !important;
						top: 13px !important;
						left:-4px !important;
						padding-top: 0px !important;
						padding-bottom: 0px !important;
						width:450px;
					}

					#roam42-wB-container .tt-highlight {
						background-color: darkblue !important
					}
					
					#roam42-wB-container .tt-suggestion {
						line-height:12px;
						font-size: 10pt;
						padding-left: 7px !important;
					}

			</style>`);
	
	} //end of module

  roam42.wB.testReload = ()=>{
		console.log('reloading wB');
		try{ roam42.wB.path.fromwB_TestReload() } catch(e) {};
    roam42.loader.addScriptToPage( "workBench", roam42.host + 'ext/workBench.js');
		setTimeout(async ()=>{
			// cleanup controls if being reinitialized
			try{ document.querySelector('#roam42-wB-container').remove() } catch(e) {};
			try{ document.querySelector('#roam42-wB-container-style').remove() } catch(e) {};
			await roam42.wB.initialize();
		},1000);
  }

};