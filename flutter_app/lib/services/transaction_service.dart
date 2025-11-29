import 'dart:convert';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:http/http.dart' as http;
import 'package:connectivity_plus/connectivity_plus.dart';

class Transaction {
  final String id;
  final String from;
  final String to;
  final double amount;
  final double networkFee;
  final DateTime timestamp;
  final String status;
  final String? transactionHash;
  final bool isQueued;
  final int retryCount;

  Transaction({
    required this.id,
    required this.from,
    required this.to,
    required this.amount,
    required this.networkFee,
    required this.timestamp,
    required this.status,
    this.transactionHash,
    this.isQueued = false,
    this.retryCount = 0,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'from': from,
    'to': to,
    'amount': amount,
    'networkFee': networkFee,
    'timestamp': timestamp.toIso8601String(),
    'status': status,
    'transactionHash': transactionHash,
    'isQueued': isQueued,
    'retryCount': retryCount,
  };

  factory Transaction.fromJson(Map<String, dynamic> json) => Transaction(
    id: json['id'],
    from: json['from'],
    to: json['to'],
    amount: json['amount'],
    networkFee: json['networkFee'],
    timestamp: DateTime.parse(json['timestamp']),
    status: json['status'],
    transactionHash: json['transactionHash'],
    isQueued: json['isQueued'] ?? false,
    retryCount: json['retryCount'] ?? 0,
  );
}

class TransactionService extends ChangeNotifier {
  final SharedPreferences _prefs;
  static const String _transactionsKey = 'transactions';
  static const String _queueKey = 'transaction_queue';
  static const String _backendUrl = 'http://10.0.2.2:3000'; // For Android emulator
  
  Timer? _retryTimer;
  
  TransactionService(this._prefs) {
    _startRetryTimer();
  }
  
  @override
  void dispose() {
    _retryTimer?.cancel();
    super.dispose();
  }
  
  void _startRetryTimer() {
    _retryTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      _processQueuedTransactions();
    });
  }
  
  List<Transaction> getTransactions() {
    final transactionsJson = _prefs.getStringList(_transactionsKey) ?? [];
    return transactionsJson
        .map((json) => Transaction.fromJson(jsonDecode(json)))
        .toList()
        ..sort((a, b) => b.timestamp.compareTo(a.timestamp));
  }
  
  List<Transaction> getQueuedTransactions() {
    final queueJson = _prefs.getStringList(_queueKey) ?? [];
    return queueJson
        .map((json) => Transaction.fromJson(jsonDecode(json)))
        .toList();
  }
  
  Future<void> addTransaction(Transaction transaction) async {
    final transactions = getTransactions();
    transactions.add(transaction);
    
    await _prefs.setStringList(
      _transactionsKey,
      transactions.map((t) => jsonEncode(t.toJson())).toList(),
    );
    
    notifyListeners();
  }
  
  Future<void> queueTransaction(Transaction transaction) async {
    final queued = getQueuedTransactions();
    queued.add(transaction);
    
    await _prefs.setStringList(
      _queueKey,
      queued.map((t) => jsonEncode(t.toJson())).toList(),
    );
    
    notifyListeners();
  }
  
  Future<void> _processQueuedTransactions() async {
    final connectivity = await Connectivity().checkConnectivity();
    if (connectivity == ConnectivityResult.none) return;
    
    final queued = getQueuedTransactions();
    if (queued.isEmpty) return;
    
    for (final transaction in queued) {
      if (transaction.retryCount >= 3) continue; // Max 3 retries
      
      try {
        final success = await _sendTransactionToBackend(transaction);
        if (success) {
          await _removeFromQueue(transaction);
          await _updateTransactionStatus(transaction.id, 'completed');
        } else {
          await _incrementRetryCount(transaction);
        }
      } catch (e) {
        await _incrementRetryCount(transaction);
      }
    }
  }
  
  Future<bool> _sendTransactionToBackend(Transaction transaction) async {
    try {
      final response = await http.post(
        Uri.parse('$_backendUrl/send'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'from': transaction.from,
          'to': transaction.to,
          'amount': transaction.amount,
        }),
      );
      
      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
  
  Future<void> _removeFromQueue(Transaction transaction) async {
    final queued = getQueuedTransactions();
    queued.removeWhere((t) => t.id == transaction.id);
    
    await _prefs.setStringList(
      _queueKey,
      queued.map((t) => jsonEncode(t.toJson())).toList(),
    );
  }
  
  Future<void> _incrementRetryCount(Transaction transaction) async {
    final queued = getQueuedTransactions();
    final index = queued.indexWhere((t) => t.id == transaction.id);
    if (index != -1) {
      queued[index] = Transaction(
        id: transaction.id,
        from: transaction.from,
        to: transaction.to,
        amount: transaction.amount,
        networkFee: transaction.networkFee,
        timestamp: transaction.timestamp,
        status: transaction.status,
        isQueued: transaction.isQueued,
        retryCount: transaction.retryCount + 1,
      );
      
      await _prefs.setStringList(
        _queueKey,
        queued.map((t) => jsonEncode(t.toJson())).toList(),
      );
    }
  }
  
  Future<void> _updateTransactionStatus(String transactionId, String status) async {
    final transactions = getTransactions();
    final index = transactions.indexWhere((t) => t.id == transactionId);
    if (index != -1) {
      transactions[index] = Transaction(
        id: transactions[index].id,
        from: transactions[index].from,
        to: transactions[index].to,
        amount: transactions[index].amount,
        networkFee: transactions[index].networkFee,
        timestamp: transactions[index].timestamp,
        status: status,
        isQueued: false,
        retryCount: transactions[index].retryCount,
      );
      
      await _prefs.setStringList(
        _transactionsKey,
        transactions.map((t) => jsonEncode(t.toJson())).toList(),
      );
      
      notifyListeners();
    }
  }
  
  Future<bool> syncTransactions() async {
    try {
      final response = await http.get(Uri.parse('$_backendUrl/history'));
      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        // Process and merge with local transactions
        notifyListeners();
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}