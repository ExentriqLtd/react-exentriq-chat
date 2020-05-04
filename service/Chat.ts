/** @format */

// #region ::: IMPORT
import Axios from 'axios';
import {
  URL_EXENTRIQ_HOST,
  METHOD_AUTH_GUARDIAN_LOGIN,
  URL_DEFAULT_TALK,
  TCallbackMessageReceived,
  TCallbackMessageDeleted,
  TCallbackMessageRead,
} from 'exentriq-utils';
import { Socket, Streamer } from 'rocket-socket';
import {
  TParamsLogin,
  TParamsSignup,
  TParamsCreatePrivateGroup,
  TParamsSendMessage,
  TParamsStarMessage,
  TParamsSubscribeRoom,
  TParamsConnect,
  TParamsUploadFile,
} from '../declarations/params';
// #endregion

class ServiceImplementation {
  ddp = null;
  streamMessages = null;
  streamRoom = null;
  streamUser = null;
  reconnectInterval = null;
  connectedPromise = null;
  loginToken = null;
  userId = null;

  // #region ::: CONNECTION
  connect = async ({
    callbackOnConnected,
    callbackOnDisconnected,
    callbackOnDisconnectedByUser,
    callbackOnReconnect,
    callbackOnOpenConnection,
  }: TParamsConnect): Promise<void> => {
    // @ts-ignore
    if (this.streamMessages) this.streamMessages.destroy();
    // @ts-ignore
    if (this.streamRoom) this.streamRoom.destroy();
    // @ts-ignore
    if (this.streamUser) this.streamUser.destroy();
    // @ts-ignore
    if (this.ddp) this.ddp.disconnect();
    // @ts-ignore
    this.ddp = new Socket(URL_DEFAULT_TALK);
    // @ts-ignore
    this.connectedPromise = new Promise(resolve => {
      // @ts-ignore
      this.ddp.on('disconnected_by_user', () => {
        callbackOnDisconnectedByUser();
      });
      // @ts-ignore
      this.ddp.on('disconnected', () => {
        callbackOnDisconnected();
        if (this.reconnectInterval) {
          // @ts-ignore
          clearInterval(this.reconnectInterval);
          delete this.reconnectInterval;
        }
        // @ts-ignore
        this.reconnectInterval = setInterval(
          () => this.reconnect(callbackOnReconnect),
          2000,
        );
      });
      // @ts-ignore
      this.ddp.on('open', async () => {
        callbackOnOpenConnection();
        resolve();
      });
      // this.ddp.on('error', err => console.log(err));
      // @ts-ignore
      this.ddp.on('connected', async () => {
        if (this.reconnectInterval) {
          // @ts-ignore
          clearInterval(this.reconnectInterval);
          delete this.reconnectInterval;
        }
        if (this.loginToken) this.call('login', { resume: this.loginToken });

        callbackOnConnected();
        resolve();
      });
      // @ts-ignore
      this.streamUser = new Streamer(this.ddp, 'stream-notify-user');
    });
    // @ts-ignore
    return this.ddp;
  };

  // @ts-ignore
  reconnect = (callbackOnReconnect): void => {
    if (this.reconnectInterval) {
      // @ts-ignore
      clearInterval(this.reconnectInterval);
      delete this.reconnectInterval;
    }
    if (this.ddp) {
      callbackOnReconnect();
      // @ts-ignore
      this.ddp.reconnect();
    }
  };

  isConnected = async (): Promise<any> => this.connectedPromise;

  disconnect = async (): Promise<void> => {
    if (!this.ddp) return;
    // @ts-ignore
    this.ddp.disconnect();
    delete this.ddp;
  };

  // @ts-ignore
  call = async (method, ...params): Promise<any> => {
    if (!this.ddp) throw new Error('DDP is not initialized');
    await this.isConnected();
    // @ts-ignore
    return this.ddp.call(method, ...params);
  };

  createSession = async (guardianToken: string): Promise<any> => {
    const { loginToken, status, _id } = await this.call(
      'verifyToken',
      guardianToken,
    );
    const session = await this.call('login', { resume: loginToken });

    this.userId = _id;
    this.loginToken = loginToken;

    return { session, status };
  };
  // #endregion

  // #region ::: SUBSCRIPTION

  subscribeUser = ({
    callbackRoomInserted,
    callbackRoomUpdated,
    callbackRoomDeleted,
  }: any) => {
    const context = `asd${Math.random()}asd`;

    // @ts-ignore
    this.streamUser = new Streamer(this.ddp, 'stream-exentriq-user-stream');

    // @ts-ignore
    this.streamUser.subscribe({
      key: `rocketchat_subscription-subscription-ex/${context}/inserted`,
      userId: this.userId,
      callback: (data: any) => callbackRoomInserted(data),
    });
    // @ts-ignore
    this.streamUser.subscribe({
      key: `rocketchat_subscription-subscription-ex/${context}/updated`,
      userId: this.userId,
      callback: (data: any) => callbackRoomUpdated(data),
    });
    // @ts-ignore
    this.streamUser.subscribe({
      key: `rocketchat_subscription-subscription-ex/${context}/removed`,
      userId: this.userId,
      callback: (data: any) => callbackRoomDeleted(data),
    });

    this.call('rocketchat_subscription-subscription-ex/sync', context, {
      $date: Date.now(),
    });
  };

  unsubscribeRoom = async (rid: string): Promise<void> => {
    if (!this.streamMessages)
      throw new Error('Unsubscribe Room without subscription');
    // @ts-ignore
    this.streamMessages.unsubscribe({
      key: rid,
    });
    // @ts-ignore
    this.streamRoom.unsubscribe({
      key: `${rid}/typing`,
    });
    // @ts-ignore
    this.streamRoom.unsubscribe({
      key: `${rid}/deleteMessage`,
    });
    // @ts-ignore
    this.streamRoom.unsubscribe({
      key: `${rid}/messagesReadByUser`,
    });
  };

  subscribeRoom = async ({
    rid,
    callbackMessageDeleted,
    callbackUserMessageRead,
    // callbackUserReceivedMessage,
    callbackUserIsTyping,
    callbackMessageReceived,
  }: TParamsSubscribeRoom): Promise<void> => {
    // @ts-ignore
    this.streamMessages = new Streamer(this.ddp, 'stream-room-messages', false);
    // @ts-ignore
    this.streamRoom = new Streamer(this.ddp, 'stream-notify-room', false);
    // @ts-ignore
    this.streamMessages.subscribe({
      key: rid,
      callback: (data: TCallbackMessageReceived) =>
        callbackMessageReceived(data),
    });
    // @ts-ignore
    this.streamRoom.subscribe({
      key: `${rid}/typing`,
      callback: (username: string, isTyping: boolean) =>
        callbackUserIsTyping({ username, isTyping }),
    });
    // @ts-ignore
    this.streamRoom.subscribe({
      key: `${rid}/deleteMessage`,
      callback: (data: TCallbackMessageDeleted) => callbackMessageDeleted(data),
    });
    // @ts-ignore
    this.streamRoom.subscribe({
      key: `${rid}/messagesReadByUser`,
      callback: (data: TCallbackMessageRead) => callbackUserMessageRead(data),
    });

    // this.streamRoom.subscribe({
    //   key: `${rid}/messagesReceivedByUser`,
    //   userId: null,
    //   callback: data => callbackUserReceivedMessage(data),
    // });
  };
  // #endregion

  // #region ::: AUTH
  login = async ({ username, password }: TParamsLogin): Promise<any> => {
    const response = await Axios.post(`${URL_EXENTRIQ_HOST}`, {
      method: METHOD_AUTH_GUARDIAN_LOGIN,
      params: [username.toLowerCase(), password.toLowerCase()],
    });
    return response.data.result;
  };

  signup = async ({
    username: name,
    email,
    password: pass,
  }: TParamsSignup): Promise<boolean> => {
    const response = await this.call('registerUser', {
      name,
      email,
      pass,
    });
    return response;
  };

  recoveryPassword = async (email: string): Promise<boolean> => {
    const response = await this.call('sendForgotPasswordEmail', email);
    return response;
  };
  // #endregion

  // #region ::: ROOM
  createPrivateGroup = async ({
    groupName,
    memberList,
  }: TParamsCreatePrivateGroup): Promise<any> => {
    const { rid } = await this.call(
      'createPrivateGroup',
      groupName,
      memberList,
    );
    return rid;
  };

  getPrivateGroups = async (): Promise<any> => {
    // @ts-ignore
    const response = await this.ddp.get('groups.list');
    return response.groups;
  };

  createNewRoom = async (username: string): Promise<any> => {
    const response = await this.call('createDirectMessage', username);
    return response.rid;
  };

  fetchRoomList = async (limit = 100): Promise<any> => {
    const rooms = await this.call('getRooms', { sort: { lm: -1 }, limit });
    return rooms;
  };

  fetchUserListRoom = async (rid: string): Promise<any> => {
    const response = await this.call('getRoomUsers', rid);
    return response;
  };

  leaveRoom = async (rid: string): Promise<any> => {
    const response = await this.call('leaveRoom', rid);
    return response;
  };

  hideRoom = async (rid: string): Promise<any> => {
    const response = await this.call('hideRoom', rid);
    return response;
  };
  // #endregion

  // #region ::: MESSAGES
  fetchMessageList = async ({ rid, limit = 20 }: any): Promise<any> => {
    const data = await this.call('loadHistory', rid, null, limit, {
      $date: Date.now(),
    });
    return data;
  };

  sendMessage = async ({ rid, msg }: TParamsSendMessage): Promise<any> => {
    const response = await this.call('sendMessage', {
      rid,
      msg,
    });
    return response;
  };

  deleteMessage = async (messageID: string): Promise<any> => {
    const response = await this.call('deleteMessage', {
      _id: messageID,
    });
    return response;
  };

  searchMessage = async (keyword: string, limit: number = 20): Promise<any> => {
    const messageList = await this.call('searchMessages', keyword, limit);
    return messageList;
  };

  updateMessage = async ({ rid, messageID, text }: any): Promise<any> => {
    const response = await this.call('updateMessage', {
      rid,
      msg: text,
      _id: messageID,
    });
    return response;
  };

  readMessages = async (rid: string): Promise<any> => {
    const response = await this.call('readMessages', rid);
    return response;
  };

  starMessage = async ({
    messageID,
    starred,
  }: TParamsStarMessage): Promise<any> => {
    const response = await this.call('starMessage', {
      _id: messageID,
      starred,
    });
    return response;
  };

  setMessageReaction = async ({ emoji, messageID }: any): Promise<any> => {
    const response = await this.call('setReaction', emoji, messageID);
    return response;
  };

  uploadFile = async ({ rid, file }: TParamsUploadFile): Promise<any> => {
    const boundary = 'myboundary';
    let data = '';
    data += '--' + boundary + '\r\n';
    data +=
      'Content-Disposition: form-data; name="photo"; filename="file.png"' +
      '\r\n';
    data += 'Content-Type: image/png' + '\r\n';
    data += '\r\n';
    data += file.data + '\r\n';
    data += '--' + boundary + '--';

    const XHR = new XMLHttpRequest();
    XHR.open('POST', `${URL_DEFAULT_TALK}/api/room/${rid}/upload64`);
    XHR.setRequestHeader('X-Auth-Token', this.loginToken || '');
    XHR.setRequestHeader('X-User-Id', this.userId || '');
    XHR.setRequestHeader(
      'Content-Type',
      'multipart/form-data; boundary=' + boundary,
    );
    XHR.send(data);
  };
  // #endregion

  // #region ::: USER
  setUserStatus = async (status: string): Promise<any> => {
    const response = await this.call('UserPresence:setDefaultStatus', status);
    return response;
  };

  fetchMentions = async (username: string): Promise<any> => {
    const response = await this.call('findMentionsByUsername', username);
    return response;
  };

  searchUser = async (
    keyword: string,
    limit: number = 100,
    context?: any,
  ): Promise<any> => {
    const users = await this.call('searchAll', keyword, limit, context, false);
    return users;
  };
  // #endregion
}

export const Service = new ServiceImplementation();
