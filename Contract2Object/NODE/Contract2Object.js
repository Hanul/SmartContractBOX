global.Contract2Object = CLASS((cls) => {
	
	let Web3 = require('web3');
	
	// Web3 체크
	if (typeof global.web3 !== 'undefined') {
		global.web3 = new Web3(global.web3.currentProvider);
	}
	
	else {
		
		let getProvider = () => {
				
			let provider = new Web3.providers.WebsocketProvider(CONFIG.isDevMode !== true ? 'wss://mainnet.infura.io/ws' : 'wss://kovan.infura.io/ws');
			provider.on('end', (e) => {
				SHOW_ERROR('Contract2Object', 'WebsocketProvider의 접속이 끊어졌습니다. 재접속합니다.');
				web3.setProvider(getProvider());
			});
			
			return provider;
		};
		
		global.web3 = new Web3(getProvider());
	}
	
	// 결과를 정돈합니다.
	let cleanResult = (outputs, result) => {
		
		// output이 없는 경우
		if (outputs.length === 0) {
			return undefined;
		}
		
		// output이 1개인 경우
		else if (outputs.length === 1) {
			
			let type = outputs[0].type;
			
			// 배열인 경우
			if (type.substring(type.length - 2) === '[]') {
				
				let array = [];
				let strArray = [];
				EACH(result, (value, i) => {
					if (type.indexOf('int') !== -1) {
						array.push(INTEGER(value));
						strArray.push(value);
					} else {
						array.push(value);
						strArray.push(value);
					}
				});
				
				return {
					value : array,
					str : strArray
				};
			}
			
			// 숫자인 경우
			else if (type.indexOf('int') !== -1) {
				return {
					value : INTEGER(result),
					str : result
				};
			}
			
			// 기타
			else {
				return {
					value : result,
					str : result
				};
			}
		}
		
		// output이 여러개인 경우
		else if (outputs.length > 1) {
			
			let resultArray = [];
			
			EACH(outputs, (output, i) => {
				
				let type = output.type;
				
				// 배열인 경우
				if (type.substring(type.length - 2) === '[]') {
					
					let array = [];
					EACH(result[i], (value, j) => {
						if (type.indexOf('int') !== -1) {
							array.push(INTEGER(value));
						} else {
							array.push(value);
						}
					});
					
					resultArray.push(array);
				}
				
				// 숫자인 경우
				else if (type.indexOf('int') !== -1) {
					resultArray.push(INTEGER(result[i]));
				}
				
				// 기타
				else {
					resultArray.push(result[i]);
				}
			});
			
			EACH(outputs, (output, i) => {
				
				let type = output.type;
				
				// 배열인 경우
				if (type.substring(type.length - 2) === '[]') {
					
					let strArray = [];
					EACH(result[i], (value, j) => {
						if (type.indexOf('int') !== -1) {
							strArray.push(value);
						} else {
							strArray.push(value);
						}
					});
					
					resultArray.push(strArray);
				}
				
				// 숫자인 경우
				else if (type.indexOf('int') !== -1) {
					resultArray.push(result[i]);
				}
				
				// 기타
				else {
					resultArray.push(result[i]);
				}
			});
			
			return {
				array : resultArray
			};
		}
	};
	
	return {
		
		init : (inner, self, params) => {
			//REQUIRED: params
			//REQUIRED: params.abi
			//REQUIRED: params.address
			
			let abi = params.abi;
			let address = params.address;
			
			let getAddress = self.getAddress = () => {
				return address;
			};
			
			let eventMap = {};
			
			let contract = new web3.eth.Contract(abi, address);
			
			// 계약의 이벤트 핸들링
			contract.events.allEvents((error, info) => {
				
				if (error === TO_DELETE) {
					
					let eventHandlers = eventMap[info.event];
		
					if (eventHandlers !== undefined) {
						EACH(eventHandlers, (eventHandler) => {
							eventHandler(info.returnValues);
						});
					}
				}
			});
			
			// 함수 분석 및 생성
			EACH(abi, (funcInfo) => {
				if (funcInfo.type === 'function') {
					
					self[funcInfo.name] = (params, callbackOrHandlers) => {
						
						// 콜백만 입력된 경우
						if (callbackOrHandlers === undefined) {
							callbackOrHandlers = params;
							params = undefined;
						}
						
						let callback;
						let transactionAddressCallback;
						let errorHandler;
						
						// 콜백 정리
						if (CHECK_IS_DATA(callbackOrHandlers) !== true) {
							callback = callbackOrHandlers;
						} else {
							callback = callbackOrHandlers.success;
							transactionAddressCallback = callbackOrHandlers.transactionAddress;
							errorHandler = callbackOrHandlers.error;
						}
						
						let args = [];
						
						// 파라미터가 없는 경우
						if (funcInfo.inputs.length === 0) {
							// ignore.
						}
						
						// 파라미터가 1개인 경우
						else if (funcInfo.inputs.length === 1) {
							args.push(params);
						}
						
						// 파라미터가 여러개인 경우
						else if (funcInfo.inputs.length > 1) {
							
							let paramsArray = [];
							EACH(params, (param) => {
								paramsArray.push(param);
							});
							
							EACH(funcInfo.inputs, (input, i) => {
								if (input.name !== '') {
									args.push(params[input.name]);
								} else {
									args.push(paramsArray[i]);
								}
							});
						}
						
						// 함수 실행
						contract.methods[funcInfo.name].apply(contract.methods, args).call((error, result) => {
							
							// 계약 실행 오류 발생
							if (error !== TO_DELETE) {
								if (errorHandler !== undefined) {
									errorHandler(error.toString());
								} else {
									SHOW_ERROR(funcInfo.name, error.toString(), params);
								}
							}
							
							// 정상 작동
							else {
								
								// constant 함수인 경우
								if (funcInfo.constant === true) {
									
									if (callback !== undefined) {
										
										// output이 없는 경우
										if (funcInfo.outputs.length === 0) {
											callback();
										}
										
										// output이 1개인 경우
										else if (funcInfo.outputs.length === 1) {
											result = cleanResult(funcInfo.outputs, result);
											callback(result.value, result.str);
										}
										
										// output이 여러개인 경우
										else if (funcInfo.outputs.length > 1) {
											result = cleanResult(funcInfo.outputs, result);
											callback.apply(TO_DELETE, result.array);
										}
									}
								}
								
								// 트랜잭션이 필요한 함수인 경우
								else {
									// 실행 불가
								}
							}
						});
					};
				}
			});
			
			// 이벤트 핸들러를 등록합니다.
			let on = self.on = (eventName, eventHandler) => {
				//REQUIRED: eventName
				//REQUIRED: eventHandler
				
				if (eventMap[eventName] === undefined) {
					eventMap[eventName] = [];
				}
	
				eventMap[eventName].push(eventHandler);
			};
			
			// 이벤트 핸들러를 제거합니다.
			let off = self.off = (eventName, eventHandler) => {
				//REQUIRED: eventName
				//OPTIONAL: eventHandler
	
				if (eventMap[eventName] !== undefined) {
	
					if (eventHandler !== undefined) {
	
						REMOVE({
							array: eventMap[eventName],
							value: eventHandler
						});
					}
	
					if (eventHandler === undefined || eventMap[eventName].length === 0) {
						delete eventMap[eventName];
					}
				}
			};
			
			// UPPERCASE-ROOM 기능을 사용하여 클라이언트에서 web3를 지원하지 않더라도 서버를 통해 정보를 받아오도록 합니다.
			if (global.UPPERCASE !== undefined && UPPERCASE.ROOM !== undefined) {
				
				UPPERCASE.ROOM('__Contract2Object/' + address, (clientInfo, on, off) => {
					
					// 함수 분석 및 생성
					EACH(abi, (funcInfo) => {
						if (funcInfo.type === 'function') {
							
							on(funcInfo.name, (params, ret) => {
								
								let args = [];
								
								// 파라미터가 없는 경우
								if (funcInfo.inputs.length === 0) {
									// ignore.
								}
								
								// 파라미터가 1개인 경우
								else if (funcInfo.inputs.length === 1) {
									args.push(params);
								}
								
								// 파라미터가 여러개인 경우
								else if (funcInfo.inputs.length > 1) {
									
									let paramsArray = [];
									EACH(params, (param) => {
										paramsArray.push(param);
									});
									
									EACH(funcInfo.inputs, (input, i) => {
										if (input.name !== '') {
											args.push(params[input.name]);
										} else {
											args.push(paramsArray[i]);
										}
									});
								}
								
								// 함수 실행
								contract.methods[funcInfo.name].apply(contract.methods, args).call((error, result) => {
									
									// 계약 실행 오류 발생
									if (error !== TO_DELETE) {
										SHOW_ERROR(funcInfo.name, error.toString(), params);
									}
									
									// 정상 작동
									else {
										
										// constant 함수인 경우
										if (funcInfo.constant === true) {
											ret(cleanResult(funcInfo.outputs, result));
										}
										
										// 트랜잭션이 필요한 함수인 경우
										else {
											// 실행 불가
										}
									}
								});
							});
						}
					});
				});
			}
		}
	};
});